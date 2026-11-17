import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  CanvasRequest,
  CanvasTarget,
  ModulesMessage,
  PreviewEvent,
  RenderRequest,
} from "../preview/protocol";
import type { Manifest } from "../shared/manifest";
import { type Messages, t, useMessages } from "./i18n";
import { showToast } from "./toast";
import { workspace } from "./workspace";

/** 预览页。和界面放在一起，部署到哪里都用相对于 base 的地址 */
const PREVIEW_URL = `${import.meta.env.BASE_URL}preview.html`;

const noop = () => () => {};

/** 交给预览页的内容：编译好的文件、能渲染的组件、要先放进页面的样式（定义 token 的文件） */
const modulesMessage = (
  manifest: Manifest,
  modules: ModulesMessage["modules"]
): ModulesMessage => ({
  components: [
    ...new Set([
      ...manifest.components.filter((c) => !c.unavailable).map((c) => c.file),
      ...manifest.providers.map((p) => p.file),
    ]),
  ],
  modules,
  styles: [...new Set(manifest.tokens.map((token) => token.file))],
  type: "dsp:modules",
});

type Status =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; message: string }
  /** 等了很久也没有回应（组件里有死循环等） */
  | { kind: "stuck" };

/** 发出请求后等这么久没有回应，就提示可以重新加载预览 */
const STUCK_AFTER = 8000;

/** 预览页加载完以后等这么久还没有 dsp:alive，就当作沙箱用不了 */
const ALIVE_WITHIN = 3000;

/**
 * 沙箱能不能用。有的浏览器（或扩展）会挡住沙箱里的页面，这时改用不带沙箱的 iframe，
 * 预览照样能用，只是组件的代码和界面不再隔开。一次判断以后这次打开的页面里都沿用
 */
let sandboxWorks: boolean | undefined;

/** 预览的显示方式。在中间区域的标题栏里切换 */
export interface PreviewOptions {
  /** 组件后面的背景 */
  background: "light" | "dark" | "grid";
  /** 预览的宽度：占满，或固定成手机、平板的宽度 */
  width: "auto" | "mobile" | "tablet";
}

export const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = { background: "light", width: "auto" };

const backgrounds = (m: Messages["preview"]) =>
  [
    ["light", m.light],
    ["dark", m.dark],
    ["grid", m.grid],
  ] as const;

/** 固定宽度时的像素数 */
const WIDTH_PX = { auto: undefined, mobile: 375, tablet: 768 };

const widths = (m: Messages["preview"]) =>
  [
    ["auto", m.auto],
    ["mobile", m.mobile],
    ["tablet", m.tablet],
  ] as const;

/** 一组只能选一个的按钮 */
export const Segments = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string, ...unknown[]])[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <fieldset aria-label={label} className="bl-segments">
    {options.map(([option, text]) => (
      <button
        aria-pressed={value === option}
        className="bl-segment"
        key={option}
        onClick={() => onChange(option)}
        type="button"
      >
        {text}
      </button>
    ))}
  </fieldset>
);

/** 标题栏右侧的预览工具：背景、宽度 */
export const PreviewToolbar = ({
  options,
  onChange,
}: {
  options: PreviewOptions;
  onChange: (options: PreviewOptions) => void;
}) => {
  const m = useMessages().preview;
  return (
    <div className="bl-toolbar">
      <Segments
        label={m.background}
        onChange={(background) => onChange({ ...options, background })}
        options={backgrounds(m)}
        value={options.background}
      />
      <Segments
        label={m.width}
        onChange={(width) => onChange({ ...options, width })}
        options={widths(m)}
        value={options.width}
      />
    </div>
  );
};

/**
 * 在 iframe 里渲染组件。iframe 只加载一次，编译好的工作区、换组件、改 props 都用 postMessage 告诉它。
 * 工作区的内容变了时把新的编译结果交给它，它会重新渲染最后一次请求的组件。
 */
export const Preview = ({
  request,
  options = DEFAULT_PREVIEW_OPTIONS,
  onSelect,
  onDrop,
  onKey,
}: {
  /** 一个组件，或者画布（一棵组件树） */
  request: RenderRequest | CanvasRequest;
  options?: PreviewOptions;
  /** 画布上点了组件 */
  onSelect?: (id: string | null) => void;
  /** 有组件拖到了画布上 */
  onDrop?: (drop: { target: CanvasTarget; component?: string; node?: string }) => void;
  /** 画布上按了快捷键 */
  onKey?: (key: "undo" | "redo" | "delete") => void;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  // 重新加载预览时换一个 key，iframe 重新建
  const [frameKey, setFrameKey] = useState(0);
  const [sandboxed, setSandboxed] = useState(sandboxWorks !== false);
  const sandboxedRef = useRef(sandboxed);
  sandboxedRef.current = sandboxed;
  const alive = useRef(false);
  const aliveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** 发给预览页。预览页在沙箱里（origin 是 null），只能用 "*" */
  const post = (message: unknown) => {
    frame.current?.contentWindow?.postMessage(message, "*");
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => setStatus({ kind: "stuck" }), STUCK_AFTER);
  };
  const postRef = useRef(post);
  postRef.current = post;
  useEffect(
    () => () => {
      clearTimeout(watchdog.current);
      clearTimeout(aliveTimer.current);
    },
    []
  );

  const onFrameLoad = () => {
    setLoads((count) => count + 1);
    if (!sandboxed || sandboxWorks) return;
    clearTimeout(aliveTimer.current);
    aliveTimer.current = setTimeout(() => {
      if (alive.current) return;
      // 沙箱里的页面没跑起来：改用不带沙箱的
      sandboxWorks = false;
      clearTimeout(watchdog.current);
      alive.current = false;
      setReady(false);
      setLoads(0);
      setSandboxed(false);
      setFrameKey((k) => k + 1);
    }, ALIVE_WITHIN);
  };
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // 函数 prop 被调用时的提示
  const [notice, setNotice] = useState<string>();

  // 收到 ready 时要发的是最新的请求
  const latest = useRef(request);
  latest.current = request;
  const handlers = useRef({ onDrop, onKey, onSelect });
  handlers.current = { onDrop, onKey, onSelect };

  // iframe 加载完（次数）。加载完、编译结果变了时交给它
  const [loads, setLoads] = useState(0);
  const state = useSyncExternalStore(workspace?.subscribe ?? noop, () => workspace?.getState());
  useEffect(() => {
    if (loads === 0 || !state?.manifest || !state.modules) return;
    postRef.current(modulesMessage(state.manifest, state.modules));
  }, [loads, state]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as PreviewEvent;
      if (data.type === "dsp:alive") {
        alive.current = true;
        if (sandboxedRef.current) sandboxWorks = true;
        return;
      }
      if (data.type === "dsp:rendered" || data.type === "dsp:error" || data.type === "dsp:ready")
        clearTimeout(watchdog.current);
      if (data.type === "dsp:ready") {
        setReady(true);
        postRef.current(latest.current);
      } else if (data.type === "dsp:rendered") {
        setStatus({ kind: "ok" });
      } else if (data.type === "dsp:error") {
        setStatus({ kind: "error", message: data.message });
        showToast("error", t().preview.failed(data.message));
      } else if (data.type === "dsp:call") {
        setNotice(t().preview.called(data.name));
      } else if (data.type === "dsp:select") {
        handlers.current.onSelect?.(data.id);
      } else if (data.type === "dsp:drop") {
        handlers.current.onDrop?.(data);
      } else if (data.type === "dsp:key") {
        handlers.current.onKey?.(data.key);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const component =
    request.type === "dsp:canvas" ? "canvas" : `${request.file}#${request.exportName}`;
  const key = JSON.stringify(request);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换了组件时清掉上一个的状态
  useEffect(() => {
    setNotice(undefined);
  }, [component]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用 key 判断请求的内容有没有变
  useEffect(() => {
    if (ready) postRef.current(latest.current);
  }, [ready, key]);

  const reload = () => {
    clearTimeout(watchdog.current);
    setReady(false);
    setLoads(0);
    setStatus({ kind: "loading" });
    setFrameKey((k) => k + 1);
  };

  // 加载超过 300ms 才显示"加载中"（很快就好时不闪一下）
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (status.kind !== "loading") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(timer);
  }, [status.kind]);

  const width = WIDTH_PX[options.width];
  const m = useMessages().preview;

  return (
    <div className="vp-preview">
      <div className="vp-preview-stage">
        <iframe
          className="vp-preview-frame"
          data-background={options.background}
          key={frameKey}
          onLoad={onFrameLoad}
          ref={frame}
          // 组件的代码在沙箱里跑：读不到界面的数据（IndexedDB 等），浏览器也会放到别的进程
          sandbox={sandboxed ? "allow-scripts" : undefined}
          src={PREVIEW_URL}
          style={width ? { width } : undefined}
          title={m.frameTitle}
        />
        {/* 第一次显示出来之前：中间写"加载中"，免得以为坏了（很快就好时不出现） */}
        {slow && status.kind === "loading" && (
          <div aria-live="polite" className="vp-preview-loading">
            <span aria-hidden="true" className="vp-preview-spinner" />
            {m.loading}
          </div>
        )}
      </div>
      {/* 加载中、出错、函数被调用、要跳转时才有文字 */}
      <p
        className="vp-preview-status"
        data-tone={status.kind === "error" || status.kind === "stuck" ? "warn" : undefined}
      >
        {status.kind === "loading" && m.loading}
        {status.kind === "error" && m.failed(status.message)}
        {status.kind === "ok" && notice}
        {status.kind === "stuck" && (
          <>
            {m.stuck}{" "}
            <button className="vp-preview-reload" onClick={reload} type="button">
              {m.reload}
            </button>
          </>
        )}
      </p>
    </div>
  );
};
