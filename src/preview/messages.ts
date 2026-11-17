// 预览页（iframe 里）自己显示的提示。语言由界面在渲染请求里告诉它。
import type { Locale } from "./protocol";

const zh = {
  canvasEmpty: "把左边大纲里的组件拖到这里",
  loadFailed: (reason: string) => `组件加载失败：${reason}`,
  noExport: (name: string) => `文件里没有找到导出 ${name}`,
  noFile: (file: string) => `预览里没有这个文件：${file}`,
  noProvider: (file: string, name: string) => `预览里没有找到 Provider：${file} 的 ${name}`,
  noVariants: "这个组件没有能列举的 props（选项、开关），没有变体可以排",
  providerLoadFailed: (reason: string) => `Provider 加载失败：${reason}`,
  unknownModule: (specifier: string, from: string) =>
    `${from} 里 import 的 ${specifier} 找不到。现在只能用 react、react-dom 和工作区里的文件`,
};

const ja: typeof zh = {
  canvasEmpty: "左のアウトライナーからコンポーネントをここにドラッグしてください",
  loadFailed: (reason) => `コンポーネントを読み込めませんでした：${reason}`,
  noExport: (name) => `ファイルにエクスポート ${name} が見つかりません`,
  noFile: (file) => `プレビューにこのファイルがありません：${file}`,
  noProvider: (file, name) => `プレビューに Provider が見つかりません：${file} の ${name}`,
  noVariants:
    "このコンポーネントには選択肢やオン・オフで切り替える props がないため、並べるバリエーションがありません",
  providerLoadFailed: (reason) => `Provider を読み込めませんでした：${reason}`,
  unknownModule: (specifier, from) =>
    `${from} で import している ${specifier} が見つかりません。今使えるのは react、react-dom とワークスペース内のファイルだけです`,
};

const en: typeof zh = {
  canvasEmpty: "Drag components here from the outliner on the left",
  loadFailed: (reason) => `Failed to load the component: ${reason}`,
  noExport: (name) => `The file has no export named ${name}`,
  noFile: (file) => `The preview does not have this file: ${file}`,
  noProvider: (file, name) => `Provider not found in the preview: ${name} in ${file}`,
  noVariants:
    "This component has no props with options or on/off switches, so there are no variants to show",
  providerLoadFailed: (reason) => `Failed to load the provider: ${reason}`,
  unknownModule: (specifier, from) =>
    `Cannot find ${specifier} imported in ${from}. Only react, react-dom and files in the workspace can be used for now`,
};

const TABLES: Record<Locale, typeof zh> = { en, ja, zh };

let locale: Locale = "zh";

/** 收到渲染请求时设一次 */
export const setPreviewLocale = (next: Locale | undefined) => {
  if (next && next in TABLES) locale = next;
};

export const texts = () => TABLES[locale];
