/** 分析的结果。分析、预览、界面三块之间只靠这份"组件清单"沟通。 */

export type PropControl =
  | { kind: "select"; options: string[] }
  | { kind: "toggle" }
  | { kind: "text" }
  | { kind: "number" }
  | { kind: "slot" }
  | { kind: "function" }
  /** 对象、数组等能写成 JSON 的值。sample 是按类型生成的示例数据 */
  | { kind: "data"; type: string; sample: unknown }
  | { kind: "unknown"; type: string };

export interface PropInfo {
  name: string;
  required: boolean;
  control: PropControl;
  /** JSDoc 注释 */
  description?: string;
  /** 解构里写的默认值，原样保留源码文本 */
  defaultValue?: string;
  /** JSDoc 的 @example 写的示例值（原样的文本）。预览、画布上放进去时先用它 */
  example?: string;
}

export interface ComponentInfo {
  name: string;
  /** 相对于工作区根目录 */
  file: string;
  /** 具名导出的名字，default export 时是 "default" */
  exportName: string;
  /** 组件自己定义的 props */
  props: PropInfo[];
  /** 从 HTML 属性等继承来的 props 的个数 */
  inheritedPropCount: number;
  /** 组件文件 import 的样式文件（CSS / SCSS / Less），相对于工作区根目录 */
  styles: string[];
  /** 用到的 token：组件 import 的 CSS 里的 CSS 变量，以及类名对应的 Tailwind theme 变量 */
  tokens: string[];
  /** 草稿：在界面里新建的组件（模板里没有这个文件） */
  draft?: true;
  /** 暂时无法显示时才有，写明原因（如异步的 Server Component） */
  unavailable?: {
    reason: string;
    /** 原因的种类。界面按它显示对应语言的说明；async 是异步的 Server Component */
    code?: "async";
  };
}

/**
 * 工作区里的 Provider（名字以 Provider 结尾、接收 children 的组件）。
 * 不算要展示的组件，但预览时可以包在组件外面，给用到它的组件提供数据
 */
export interface ProviderInfo {
  name: string;
  /** 相对于工作区根目录 */
  file: string;
  exportName: string;
  /** children 以外的 props */
  props: PropInfo[];
}

/** 工作区里定义的 design token */
export interface TokenDefinition {
  name: string;
  value: string;
  /** 定义它的 CSS 文件，相对于工作区根目录 */
  file: string;
  /** 定义在 Tailwind v4 的 `@theme` 里，还是普通的 `:root` 里 */
  source: "theme" | "root";
}

export interface Manifest {
  root: string;
  componentsDir: string;
  /** 项目装了 Tailwind CSS（package.json 里有 tailwindcss）。样式写在类名里，没有样式文件 */
  tailwind: boolean;
  components: ComponentInfo[];
  /** 工作区里的 Provider */
  providers: ProviderInfo[];
  /** 工作区里定义的 token（`@theme` 和 `:root`） */
  tokens: TokenDefinition[];
}
