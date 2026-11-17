// 预览页（iframe 里）的运行时：接收界面的渲染请求，渲染用户的组件。
//
// React 由入口模块（main.ts）传进来，这个文件自己不 import React。
// 这样渲染用的 React 和组件用的 React 是同一个。
import type * as ReactNamespace from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { createRoot as CreateRoot } from "react-dom/client";

import { installCanvas } from "./canvas";
import { setPreviewLocale, texts } from "./messages";
import type {
  CanvasRequest,
  PreviewEvent,
  RenderRequest,
  TreeNode,
  VariantGroup,
  Wrapper,
} from "./protocol";

type Loader = () => Promise<Record<string, unknown>>;

export interface PreviewOptions {
  React: typeof ReactNamespace;
  createRoot: typeof CreateRoot;
  /** 组件文件（相对于工作区根目录）→ 加载它的函数 */
  loaders: Record<string, Loader>;
  /** 渲染前要加载的全局 CSS（定义 token 的文件等）。加载失败不影响渲染 */
  styles?: Loader[];
  /** 放组件的元素，默认是 #root */
  container?: HTMLElement;
  /** 给界面发消息，默认发给父窗口 */
  post?: (event: PreviewEvent) => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface PreviewHandle {
  /** 工作区的内容变了：换成新的组件和样式，重新渲染最后一次请求的组件 */
  update: (next: Pick<PreviewOptions, "loaders" | "styles">) => void;
}

export const startPreview = (options: PreviewOptions): PreviewHandle => {
  const { React, createRoot } = options;
  let loaders = options.loaders;
  const container = options.container ?? (document.getElementById("root") as HTMLElement);
  // 预览页在沙箱里（origin 是 null），不能指定界面的 origin。发的内容只有组件名、报错这类
  const post = options.post ?? ((event: PreviewEvent) => window.parent.postMessage(event, "*"));
  const root = createRoot(container);

  interface BoundaryProps {
    children?: ReactNode;
    /** 这个值变了（换了组件或改了 props）就重新试着渲染 */
    resetKey: string;
  }

  /** 接住渲染时的错误：不崩，在预览里显示原因，并通知界面 */
  // biome-ignore lint/correctness/noComponentHookFactories: React 是传进来的，只能在这里定义。startPreview 只调用一次
  class Boundary extends React.Component<BoundaryProps, { error?: Error }> {
    state: { error?: Error } = {};

    static getDerivedStateFromError(error: Error) {
      return { error };
    }

    componentDidCatch(error: Error, _info: ErrorInfo) {
      post({ message: messageOf(error), type: "dsp:error" });
    }

    rendered() {
      post({ type: "dsp:rendered" });
    }

    componentDidMount() {
      if (!this.state.error) this.rendered();
    }

    componentDidUpdate(previous: BoundaryProps) {
      if (previous.resetKey !== this.props.resetKey && this.state.error) {
        this.setState({ error: undefined });
        return;
      }
      if (!this.state.error) this.rendered();
    }

    render() {
      return this.state.error
        ? React.createElement("p", { className: "dsp-error" }, this.state.error.message)
        : this.props.children;
    }
  }

  /** 画布上的一个组件出错时：只在它的位置显示原因，别的组件照常显示 */
  // biome-ignore lint/correctness/noComponentHookFactories: React 是传进来的，只能在这里定义。startPreview 只调用一次
  class NodeBoundary extends React.Component<BoundaryProps, { error?: Error }> {
    state: { error?: Error } = {};

    static getDerivedStateFromError(error: Error) {
      return { error };
    }

    componentDidUpdate(previous: BoundaryProps) {
      if (previous.resetKey !== this.props.resetKey && this.state.error) {
        this.setState({ error: undefined });
      }
    }

    render() {
      return this.state.error
        ? React.createElement("p", { className: "dsp-error" }, this.state.error.message)
        : this.props.children;
    }
  }

  const canvas = installCanvas(post, container.ownerDocument);

  /** 工作区的内容换了几次。换了以后之前的渲染错误要重新试 */
  let generation = 0;

  /** 并排比较时换成别的方案：:root:root 比 src/tokens.css 的 :root 优先，和顺序无关 */
  const applyTokenCss = (css: string | undefined) => {
    const doc = container.ownerDocument;
    let style = doc.getElementById("dsp-token-override");
    if (!css) {
      style?.remove();
      return;
    }
    if (!style) {
      style = doc.createElement("style");
      style.id = "dsp-token-override";
      doc.head.append(style);
    }
    style.textContent = css.replace(/:root\s*\{/g, ":root:root {");
  };

  const showError = (message: string) => {
    root.render(React.createElement("p", { className: "dsp-error" }, message));
    post({ message, type: "dsp:error" });
  };

  // 请求来得比加载快时，只渲染最后一次
  let latest = 0;
  let lastRequest: RenderRequest | CanvasRequest | undefined;

  /** 外层的 Provider 先加载。失败时显示原因，返回 undefined */
  const loadWrappers = async (list: Wrapper[] | undefined, turn: number) => {
    const wrappers: [ReactNamespace.ElementType, Record<string, unknown>][] = [];
    for (const wrapper of list ?? []) {
      let provider: unknown;
      try {
        provider = (await loaders[wrapper.file]?.())?.[wrapper.exportName];
      } catch (error) {
        if (turn === latest) showError(texts().providerLoadFailed(messageOf(error)));
        return undefined;
      }
      if (turn !== latest) return undefined;
      if (typeof provider !== "function" && typeof provider !== "object") {
        showError(texts().noProvider(wrapper.file, wrapper.exportName));
        return undefined;
      }
      wrappers.push([provider as ReactNamespace.ElementType, wrapper.props]);
    }
    return wrappers;
  };

  /** 从最里面的 Provider 开始，一层一层包到外面 */
  const wrap = (
    wrappers: [ReactNamespace.ElementType, Record<string, unknown>][],
    content: ReactNode
  ) =>
    wrappers.reduceRight<ReactNode>(
      (child, [provider, providerProps]) => React.createElement(provider, providerProps, child),
      content
    );

  const withFunctions = (props: Record<string, unknown>, functions: string[]) => {
    const next = { ...props };
    for (const name of functions) next[name] = () => post({ name, type: "dsp:call" });
    return next;
  };

  const render = async (request: RenderRequest) => {
    const turn = ++latest;
    lastRequest = request;
    canvas.hide();
    setPreviewLocale(request.locale);
    applyTokenCss(request.tokenCss);
    const load = loaders[request.file];
    if (!load) {
      showError(texts().noFile(request.file));
      return;
    }
    let component: unknown;
    try {
      component = (await load())[request.exportName];
    } catch (error) {
      if (turn === latest) showError(texts().loadFailed(messageOf(error)));
      return;
    }
    if (turn !== latest) return;
    if (typeof component !== "function" && typeof component !== "object") {
      showError(texts().noExport(request.exportName));
      return;
    }
    const wrappers = await loadWrappers(request.wrappers, turn);
    if (!wrappers) return;

    const element = (props: Record<string, unknown>) =>
      React.createElement(
        component as ReactNamespace.ElementType,
        withFunctions(props, request.functions)
      );
    root.render(
      React.createElement(
        Boundary,
        {
          key: `${request.file}#${request.exportName}#${generation}`,
          resetKey: JSON.stringify([request.props, request.wrappers, request.variants]),
        },
        wrap(
          wrappers,
          request.variants ? variantGrid(request.variants, element) : element(request.props)
        )
      )
    );
  };

  /** 变体一览：每个能列举的 prop 一行，一个变体出错只在它的格子里显示原因 */
  const variantGrid = (
    groups: VariantGroup[],
    element: (props: Record<string, unknown>) => ReactNode
  ): ReactNode =>
    React.createElement(
      "div",
      { className: "dsp-variants" },
      groups.length === 0
        ? React.createElement("p", { className: "dsp-variants-empty" }, texts().noVariants)
        : groups.map((group) =>
            React.createElement(
              "section",
              { className: "dsp-variant-group", key: group.label },
              React.createElement("h3", { className: "dsp-variant-label" }, group.label),
              React.createElement(
                "div",
                { className: "dsp-variant-row" },
                group.items.map((item) =>
                  React.createElement(
                    "figure",
                    { className: "dsp-variant", key: item.label },
                    React.createElement(
                      NodeBoundary,
                      { resetKey: JSON.stringify([item.props, generation]) },
                      element(item.props)
                    ),
                    React.createElement("figcaption", null, item.label)
                  )
                )
              )
            )
          )
    );

  /** 画布：一棵组件树。一个组件出错不影响别的 */
  const renderCanvas = async (request: CanvasRequest) => {
    const turn = ++latest;
    lastRequest = request;
    setPreviewLocale(request.locale);
    applyTokenCss(request.tokenCss);

    const files = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        files.add(node.file);
        collect(node.children);
      }
    };
    collect(request.nodes);
    const modules = new Map<string, Record<string, unknown>>();
    const failures = new Map<string, string>();
    for (const file of files) {
      const load = loaders[file];
      if (!load) {
        failures.set(file, texts().noFile(file));
        continue;
      }
      try {
        modules.set(file, await load());
      } catch (error) {
        failures.set(file, texts().loadFailed(messageOf(error)));
      }
      if (turn !== latest) return;
    }
    const wrappers = await loadWrappers(request.wrappers, turn);
    if (!wrappers) return;

    const build = (node: TreeNode): ReactNode => {
      const component = modules.get(node.file)?.[node.exportName];
      const props = withFunctions(node.props, node.functions);
      if (node.children.length > 0) props.children = node.children.map(build);
      const content =
        typeof component === "function" || typeof component === "object"
          ? React.createElement(component as ReactNamespace.ElementType, props)
          : React.createElement(
              "p",
              { className: "dsp-error" },
              failures.get(node.file) ?? texts().noExport(node.exportName)
            );
      return React.createElement(
        "div",
        { "data-dsp-node": node.id, key: node.id, style: { display: "contents" } },
        React.createElement(
          NodeBoundary,
          { resetKey: JSON.stringify([node.props, generation]) },
          content
        )
      );
    };

    root.render(
      React.createElement(
        Boundary,
        { key: `canvas#${generation}`, resetKey: JSON.stringify(request) },
        wrap(
          wrappers,
          React.createElement(
            "div",
            { className: "dsp-canvas", "data-dsp-root": "" },
            request.nodes.length > 0
              ? request.nodes.map(build)
              : React.createElement("p", { className: "dsp-canvas-empty" }, texts().canvasEmpty)
          )
        )
      )
    );
    canvas.show(request.nodes, request.selected);
  };

  const draw = (request: RenderRequest | CanvasRequest) =>
    request.type === "dsp:canvas" ? renderCanvas(request) : render(request);

  const loadStyles = (styles: PreviewOptions["styles"]) =>
    Promise.allSettled((styles ?? []).map((load) => load()));
  let ready = loadStyles(options.styles);

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as RenderRequest | CanvasRequest | undefined;
    if (data?.type === "dsp:render" || data?.type === "dsp:canvas") ready.then(() => draw(data));
  });

  ready.then(() => post({ type: "dsp:ready" }));

  return {
    update: (next) => {
      generation++;
      loaders = next.loaders;
      ready = loadStyles(next.styles);
      ready.then(() => {
        if (lastRequest) draw(lastRequest);
      });
    },
  };
};
