import type { ComponentInfo, Manifest } from "../shared/manifest";

/** 大纲里选中的东西：一个组件（用"文件#导出名"区分），或一个页面（画布） */
export type Selection = { kind: "component"; id: string } | { kind: "page"; name: string };

export const componentId = (component: ComponentInfo) =>
  `${component.file}#${component.exportName}`;

export const isSame = (a: Selection | undefined, b: Selection) => {
  if (a?.kind === "component") return b.kind === "component" && a.id === b.id;
  if (a?.kind === "page") return b.kind === "page" && a.name === b.name;
  return false;
};

/** 默认选中第一个组件 */
export const initialSelection = (manifest: Manifest): Selection | undefined => {
  const component = manifest.components[0];
  return component ? { id: componentId(component), kind: "component" } : undefined;
};

/** 选中的东西还在吗（文件改动后组件可能消失，页面可能被删掉） */
export const stillExists = (manifest: Manifest, selection: Selection, pages: string[] = []) => {
  if (selection.kind === "page") return pages.includes(selection.name);
  return manifest.components.some((c) => componentId(c) === selection.id);
};

export const findComponent = (manifest: Manifest, id: string) =>
  manifest.components.find((c) => componentId(c) === id);
