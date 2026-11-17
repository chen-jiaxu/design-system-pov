// 画布：拖进来的组件排成一棵树。根上的组件从上往下排，组件里能放组件（放进它的 children）。
// 这份结构存成工作区里的 src/pages/名字.canvas.json，页面的代码（src/pages/名字.tsx）由它生成。
import type { ComponentInfo } from "../shared/manifest";
import type { PropValues } from "./prop-values";

export interface CanvasNode {
  id: string;
  /** 组件："文件#导出名"（和大纲里的 componentId 一样） */
  component: string;
  /** 属性面板里填的值。有子组件时不用 children 这个值 */
  props: PropValues;
  /** 放在这个组件里面的组件（作为 children 传进去） */
  children: CanvasNode[];
}

export interface CanvasPage {
  version: 1;
  /** 根上的组件，从上往下排 */
  nodes: CanvasNode[];
}

/** 放到哪里：parent 是 null 时放在根上；index 是放进去以后的位置 */
export interface DropTarget {
  parent: string | null;
  index: number;
}

export const emptyPage = (): CanvasPage => ({ nodes: [], version: 1 });

export const serializePage = (page: CanvasPage) => `${JSON.stringify(page, null, 2)}\n`;

const isNode = (value: unknown): value is CanvasNode => {
  const node = value as CanvasNode;
  return (
    typeof node === "object" &&
    node !== null &&
    typeof node.id === "string" &&
    typeof node.component === "string" &&
    typeof node.props === "object" &&
    Array.isArray(node.children) &&
    node.children.every(isNode)
  );
};

/** 读 canvas.json。格式不对时返回 undefined */
export const parsePage = (text: string): CanvasPage | undefined => {
  try {
    const value = JSON.parse(text) as CanvasPage;
    return value?.version === 1 && Array.isArray(value.nodes) && value.nodes.every(isNode)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

let counter = 0;
export const newNodeId = () =>
  `n${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 组件能放别的组件进去吗：有 children 这个插槽才行 */
export const acceptsChildren = (component: ComponentInfo | undefined) =>
  component?.props.some((p) => p.name === "children" && p.control.kind === "slot") ?? false;

/** 找到组件和它在哪里 */
export const findNode = (
  nodes: CanvasNode[],
  id: string,
  parent: string | null = null
): { node: CanvasNode; parent: string | null; index: number } | undefined => {
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return { index, node, parent };
    const found = findNode(node.children, id, node.id);
    if (found) return found;
  }
  return undefined;
};

/** 每个组件都换一遍（change 返回同一个对象表示不变） */
const mapNodes = (nodes: CanvasNode[], change: (node: CanvasNode) => CanvasNode): CanvasNode[] =>
  nodes.map((node) => {
    const next = change(node);
    return { ...next, children: mapNodes(next.children, change) };
  });

const insertAt = <T>(list: T[], index: number, item: T) => {
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), item, ...list.slice(at)];
};

export const insertNode = (page: CanvasPage, target: DropTarget, node: CanvasNode): CanvasPage => {
  if (target.parent === null) return { ...page, nodes: insertAt(page.nodes, target.index, node) };
  return {
    ...page,
    nodes: mapNodes(page.nodes, (n) =>
      n.id === target.parent ? { ...n, children: insertAt(n.children, target.index, node) } : n
    ),
  };
};

const without = (nodes: CanvasNode[], id: string): CanvasNode[] =>
  nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: without(n.children, id) }));

export const removeNode = (page: CanvasPage, id: string): CanvasPage => ({
  ...page,
  nodes: without(page.nodes, id),
});

/** 挪到别的地方。不能挪进自己里面 */
export const moveNode = (page: CanvasPage, id: string, target: DropTarget): CanvasPage => {
  const found = findNode(page.nodes, id);
  if (!found) return page;
  if (target.parent !== null && findNode([found.node], target.parent)) return page;
  // 同一层里往后挪：自己先拿走了，后面的位置都往前一格
  const index =
    found.parent === target.parent && found.index < target.index ? target.index - 1 : target.index;
  return insertNode(removeNode(page, id), { ...target, index }, found.node);
};

export const updateNode = (
  page: CanvasPage,
  id: string,
  change: (node: CanvasNode) => CanvasNode
): CanvasPage => ({
  ...page,
  nodes: mapNodes(page.nodes, (n) => (n.id === id ? change(n) : n)),
});

/** 页面里所有的组件（从上往下、从外到里） */
export const allNodes = (nodes: CanvasNode[]): CanvasNode[] =>
  nodes.flatMap((node) => [node, ...allNodes(node.children)]);
