/** 界面和预览（iframe）之间的消息。两边只靠 postMessage 沟通。 */
import type { PreviewModule } from "./modules";

/** 界面的语言。预览里的提示也用它 */
export type Locale = "zh" | "ja" | "en";

/** 包在组件外面的 Provider */
export interface Wrapper {
  /** Provider 的文件，相对于工作区根目录 */
  file: string;
  exportName: string;
  props: Record<string, unknown>;
}

/** 变体一览的一行：只换一个 prop 的值 */
export interface VariantGroup {
  /** prop 的名字 */
  label: string;
  items: { label: string; props: Record<string, unknown> }[];
}

/** 界面 → 预览：渲染这个组件 */
export interface RenderRequest {
  type: "dsp:render";
  /** 组件文件，相对于工作区根目录 */
  file: string;
  exportName: string;
  /** 能直接传的 props（文本、数字、开关等） */
  props: Record<string, unknown>;
  /** 函数类型的 props 的名字。预览里换成空函数，被调用时通知界面 */
  functions: string[];
  /** 包在组件外面的 Provider，从外到里 */
  wrappers?: Wrapper[];
  /** 界面的语言。没有时用中文 */
  locale?: Locale;
  /** 换成别的 Design Token 方案时的 CSS（并排比较用）。没有时用工作区的 src/tokens.css */
  tokenCss?: string;
  /** 有这个时不是显示一个，而是排出所有变体（每行换一个 prop 的值） */
  variants?: VariantGroup[];
}

/** 画布上的一个组件 */
export interface TreeNode {
  id: string;
  /** 组件文件，相对于工作区根目录 */
  file: string;
  exportName: string;
  props: Record<string, unknown>;
  functions: string[];
  /** 能把别的组件放进去（有 children 插槽） */
  container: boolean;
  /** 放在里面的组件，作为 children 传进去 */
  children: TreeNode[];
}

/** 界面 → 预览：渲染画布（一棵组件树）。点击选中、拖进来的组件告诉界面 */
export interface CanvasRequest {
  type: "dsp:canvas";
  nodes: TreeNode[];
  /** 选中的组件，加框显示 */
  selected?: string;
  wrappers?: Wrapper[];
  locale?: Locale;
  /** 换成别的 Design Token 方案时的 CSS（并排比较用） */
  tokenCss?: string;
}

/** 放到画布的哪里：parent 是 null 时放在根上 */
export interface CanvasTarget {
  parent: string | null;
  index: number;
}

/** 拖动时带的数据的种类：从大纲拖来的组件、画布上已有的组件 */
export const DRAG_COMPONENT = "application/x-dsp-component";
export const DRAG_NODE = "application/x-dsp-node";

/** 界面 → 预览：工作区编译好的文件。第一次和工作区的内容变了时发 */
export interface ModulesMessage {
  type: "dsp:modules";
  /** 工作区里的文件（相对路径）→ 编译好的模块 */
  modules: Record<string, PreviewModule>;
  /** 能渲染的组件和 Provider 的文件 */
  components: string[];
  /** 渲染前要放进页面的样式（定义 token 的文件） */
  styles: string[];
}

/** 预览 → 界面 */
export type PreviewEvent =
  /** 预览页的脚本开始跑了（还没收到编译好的文件）。界面用它判断沙箱能不能用 */
  | { type: "dsp:alive" }
  /** 预览页加载完成，可以接收渲染请求（页面重新加载后也会再发一次） */
  | { type: "dsp:ready" }
  /** 渲染成功 */
  | { type: "dsp:rendered" }
  /** 加载或渲染失败 */
  | { type: "dsp:error"; message: string }
  /** 函数类型的 prop 被调用了 */
  | { type: "dsp:call"; name: string }
  /** 画布上点了组件（点在空白处时是 null） */
  | { type: "dsp:select"; id: string | null }
  /** 画布上按了快捷键（焦点在预览里时，界面收不到键盘事件） */
  | { type: "dsp:key"; key: "undo" | "redo" | "delete" }
  /** 有组件拖到了画布上：component 是从大纲拖来的新组件，node 是画布上已有的组件 */
  | { type: "dsp:drop"; target: CanvasTarget; component?: string; node?: string };
