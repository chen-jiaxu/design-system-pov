import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ComponentInfo } from "../shared/manifest";
import { TOKEN_FILE } from "./design-tokens";
import { confirmDialog } from "./dialog";
import { diffLines } from "./diff";
import {
  discardFile,
  editFile,
  isChanged,
  isUnsaved,
  saveFile,
  useChangedFiles,
  useFile,
} from "./drafts";
import { highlight, type Language, languageOf } from "./highlight";
import { type Messages, t, useMessages } from "./i18n";
import { indentOf } from "./indent";
import { toJsx } from "./jsx";
import { Segments } from "./Preview";
import type { PropValues } from "./prop-values";

/** 复制按钮。复制后短暂显示"已复制" */
export const CopyButton = ({ text }: { text: string }) => {
  const m = useMessages().code;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className="cv-copy"
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      type="button"
    >
      {copied ? m.copied : m.copy}
    </button>
  );
};

/** 一行着色的代码里的词 */
const Tokens = ({ line }: { line: ReturnType<typeof highlight>[number] | undefined }) =>
  line?.map((token, position) =>
    token.kind === "plain" ? (
      token.text
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: 一行里的位置
      <span className={`cv-${token.kind}`} key={position}>
        {token.text}
      </span>
    )
  );

/** 带行号、按语法着色的代码。keepLastLine：文件末尾的换行后面也留一行（编辑时光标能到那里） */
export const CodeLines = ({
  text,
  language = "tsx",
  keepLastLine = false,
}: {
  text: string;
  language?: Language;
  keepLastLine?: boolean;
}) => {
  const lines = useMemo(
    () => highlight(keepLastLine ? text : text.replace(/\n$/, ""), language),
    [text, language, keepLastLine]
  );
  return (
    <pre className="cv-code">
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 行号就是位置
        <span className="cv-line" data-line={index + 1} key={index}>
          {line.length === 0 ? " " : <Tokens line={line} />}
        </span>
      ))}
    </pre>
  );
};

/**
 * 能编辑的代码：着色的代码上面叠一个透明的输入框，字的位置完全重合。
 * 看到的是下面着色的字，打字、选择、光标是上面输入框的。
 */
const CodeEditor = ({
  file,
  text,
  onChange,
}: {
  file: string;
  text: string;
  onChange: (text: string) => void;
}) => {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const area = event.currentTarget;
    // Esc：离开输入框（Tab 用来缩进了，键盘操作要有别的办法出去）
    if (event.key === "Escape") {
      area.blur();
      return;
    }
    if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)
      return;
    event.preventDefault();
    const indent = indentOf(text);
    // execCommand 插入的字能用 Cmd+Z 撤销；不支持时直接改
    if (!document.execCommand("insertText", false, indent)) {
      area.setRangeText(indent, area.selectionStart, area.selectionEnd, "end");
      onChange(area.value);
    }
  };

  return (
    <div className="cv-editor">
      <CodeLines keepLastLine language={languageOf(file)} text={text} />
      <textarea
        aria-label={t().code.edit(file)}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="cv-input"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        value={text}
        wrap="off"
      />
    </div>
  );
};

/** 左右对比：左边是磁盘上的文件，右边是面板里改过的。改动的行有底色 */
const DiffView = ({ file, before, after }: { file: string; before: string; after: string }) => {
  const language = languageOf(file);
  const rows = useMemo(() => diffLines(before, after), [before, after]);
  const left = useMemo(() => highlight(before.replace(/\n$/, ""), language), [before, language]);
  const right = useMemo(() => highlight(after.replace(/\n$/, ""), language), [after, language]);
  // 打开时滚到第一处改动
  const root = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在换文件时滚，边改边看时不动
  useEffect(() => {
    root.current?.querySelector("[data-changed] > span")?.scrollIntoView({ block: "center" });
  }, [file]);
  return (
    <div className="cv-diff" ref={root}>
      <div className="cv-diff-head">{t().code.diffBefore}</div>
      <div className="cv-diff-head">{t().code.diffAfter}</div>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 行的位置
        <div className="cv-diff-row" data-changed={row.changed || undefined} key={index}>
          <span
            className="cv-diff-cell"
            data-line={row.left?.line}
            data-side={row.changed ? (row.left ? "removed" : "empty") : undefined}
          >
            {row.left && <Tokens line={left[row.left.line - 1]} />}
          </span>
          <span
            className="cv-diff-cell"
            data-line={row.right?.line}
            data-side={row.changed ? (row.right ? "added" : "empty") : undefined}
          >
            {row.right && <Tokens line={right[row.right.line - 1]} />}
          </span>
        </div>
      ))}
    </div>
  );
};

/** 保存的快捷键怎么写：Mac 是 ⌘S，其他是 Ctrl+S */
const SAVE_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘S" : "Ctrl+S";

/** 把内容作为文件下载 */
export const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

/** 文件 tab 上的图标：按文件的语言显示 */
const FileIcon = ({ file }: { file: string }) => {
  const language = languageOf(file);
  if (language === "scss") {
    return (
      <svg
        aria-label="SCSS"
        className="cv-icon cv-icon-scss"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
        viewBox="0 0 16 16"
      >
        <title>SCSS</title>
        <path d="M11.5 4.5C10.8 3.3 9.5 2.8 8 2.8c-2 0-3.5 1-3.5 2.5 0 3.2 7 2 7 5.400 0 1.5-1.5 2.5-3.5 2.5-1.6 0-3-.6-3.7-1.9" />
      </svg>
    );
  }
  if (language === "less") {
    return (
      <svg
        aria-label="Less"
        className="cv-icon cv-icon-less"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        viewBox="0 0 16 16"
      >
        <title>Less</title>
        <path d="M6 2.5c-1.5 0-2 .7-2 2v2c0 .9-.5 1.5-1.5 1.5C3.5 8 4 8.6 4 9.5v2c0 1.3.5 2 2 2M10 2.5c1.5 0 2 .7 2 2v2c0 .9.5 1.5 1.5 1.5-1 0-1.5.6-1.5 1.5v2c0 1.3-.5 2-2 2" />
      </svg>
    );
  }
  if (language === "css") {
    return (
      <svg
        aria-label="CSS"
        className="cv-icon cv-icon-css"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
        viewBox="0 0 16 16"
      >
        <title>CSS</title>
        <path d="M6.5 2.5 5 13.5M11 2.5 9.5 13.5M3 6h10.5M2.5 10H13" />
      </svg>
    );
  }
  return (
    <svg
      aria-label={t().code.reactComponent}
      className="cv-icon cv-icon-react"
      fill="none"
      role="img"
      stroke="currentColor"
      viewBox="-11 -11 22 22"
    >
      <title>{t().code.reactComponent}</title>
      <circle fill="currentColor" r="1.8" stroke="none" />
      <ellipse rx="10" ry="3.8" />
      <ellipse rx="10" ry="3.8" transform="rotate(60)" />
      <ellipse rx="10" ry="3.8" transform="rotate(120)" />
    </svg>
  );
};

type Mode = "source" | "usage" | "diff";

/** 面板能显示的内容。有改动时多一个"变更" */
const modes = (m: Messages["code"], withDiff: boolean): [Mode, string][] => [
  ["source", m.modeSource],
  ["usage", m.modeUsage],
  ...(withDiff ? [["diff", m.modeDiff] as [Mode, string]] : []),
];

const baseName = (file: string) => file.split("/").at(-1) ?? file;

/**
 * 下方的代码面板，分成这几种内容：
 * - 源码：组件文件和它 import 的样式文件（CSS / SCSS / Less），每个文件一个 tab（和 VS Code 的编辑器一样）。
 *   能直接改。光标在面板里时按 ⌘S / Ctrl+S 保存：把改的内容应用到预览（存在工作区里）。
 *   src/tokens.css 由 Design Token 的方案生成，只能看
 * - 用法：现在的 props 写成的 JSX，跟着属性面板变
 * - 变更：有改动时才有。左右对比原本的内容和改过的内容；改过的文件可以下载
 */
export const CodeView = ({
  component,
  propValues,
}: {
  component: ComponentInfo;
  propValues: PropValues;
}) => {
  const m = useMessages().code;
  const [wanted, setMode] = useState<Mode>("source");
  const editable = [component.file, ...component.styles];
  const changed = useChangedFiles(editable);
  // 改动都放弃了以后，"变更"没有了，回到源码
  const mode = wanted === "diff" && changed.length === 0 ? "source" : wanted;
  const tabs = mode === "diff" ? changed : editable;
  // 换了组件后，上一个组件选的文件不在了，回到第一个
  const [selected, setSelected] = useState(component.file);
  const tab = tabs.includes(selected) ? selected : (tabs[0] ?? component.file);
  const file = tab;
  const state = useFile(file);
  const jsx = toJsx(component, propValues);
  const text = mode === "usage" ? jsx : state.text;
  // 由 Design Token 生成的文件只能看
  const managed = file === TOKEN_FILE;
  const canEdit = mode === "source" && !managed;
  const fileChanged = mode !== "usage" && isChanged(state);

  // 光标在面板里时，⌘S / Ctrl+S 是保存（不让浏览器弹出"保存网页"）。面板外面不管
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s")
        return;
      event.preventDefault();
      if (canEdit) saveFile(file);
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [canEdit, file]);

  return (
    <div className="cv" ref={panel}>
      <div className="cv-tabs">
        <Segments
          label={m.modeLabel}
          onChange={setMode}
          options={modes(m, changed.length > 0)}
          value={mode}
        />
        {mode !== "usage" && (
          <div className="cv-files" role="tablist">
            {tabs.map((name) => (
              <button
                aria-selected={name === tab}
                className="cv-tab"
                key={name}
                onClick={() => setSelected(name)}
                role="tab"
                title={name}
                type="button"
              >
                <FileIcon file={name} />
                {baseName(name)}
                {changed.includes(name) && (
                  <span className="cv-dot" role="img" title={m.changed}>
                    ●
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <span className="cv-spacer" />
        {canEdit && isUnsaved(state) && <span className="cv-save">{m.applyHint(SAVE_KEY)}</span>}
        {fileChanged && (
          <>
            <button
              className="cv-copy"
              onClick={async () => {
                if (
                  !component.draft ||
                  (await confirmDialog({
                    confirm: t().dialog.delete,
                    danger: true,
                    message: m.deleteDraftConfirm(component.name),
                  }))
                )
                  discardFile(file);
              }}
              title={component.draft ? m.deleteDraftHint : m.discardHint}
              type="button"
            >
              {component.draft ? m.deleteDraft : m.discard}
            </button>
            <button
              className="cv-copy"
              onClick={() => download(baseName(file), state.text ?? "")}
              title={m.downloadHint}
              type="button"
            >
              {m.download}
            </button>
          </>
        )}
        {text !== undefined && <CopyButton text={text} />}
      </div>
      <div className="cv-body">
        {mode === "usage" ? (
          <CodeLines text={jsx} />
        ) : state.text === undefined || state.original === undefined ? (
          <p className="cv-note">{m.reading}</p>
        ) : mode === "diff" ? (
          <DiffView after={state.text} before={state.original} file={file} />
        ) : managed ? (
          <>
            <p className="cv-note">{m.managed}</p>
            <CodeLines language="css" text={state.text} />
          </>
        ) : (
          <CodeEditor file={file} onChange={(next) => editFile(file, next)} text={state.text} />
        )}
      </div>
    </div>
  );
};
