import { describe, expect, it } from "vitest";

import {
  type CanvasNode,
  type CanvasPage,
  emptyPage,
  findNode,
  insertNode,
  moveNode,
  parsePage,
  removeNode,
  serializePage,
  updateNode,
} from "./canvas-tree";

const node = (id: string, children: CanvasNode[] = []): CanvasNode => ({
  children,
  component: `src/${id}.tsx#${id}`,
  id,
  props: {},
});

// a、b 在根上，b 里面有 c
const page = (): CanvasPage => ({ nodes: [node("a"), node("b", [node("c")])], version: 1 });
const ids = (nodes: CanvasNode[]): unknown[] =>
  nodes.map((n) => (n.children.length > 0 ? [n.id, ids(n.children)] : n.id));

describe("canvas", () => {
  it("放到根上、放进组件里", () => {
    expect(ids(insertNode(page(), { index: 1, parent: null }, node("x")).nodes)).toEqual([
      "a",
      "x",
      ["b", ["c"]],
    ]);
    expect(ids(insertNode(page(), { index: 0, parent: "b" }, node("x")).nodes)).toEqual([
      "a",
      ["b", ["x", "c"]],
    ]);
  });

  it("挪动：同一层往后挪时位置算对；不能挪进自己里面", () => {
    expect(ids(moveNode(page(), "a", { index: 2, parent: null }).nodes)).toEqual([
      ["b", ["c"]],
      "a",
    ]);
    expect(ids(moveNode(page(), "a", { index: 1, parent: "b" }).nodes)).toEqual([
      ["b", ["c", "a"]],
    ]);
    expect(ids(moveNode(page(), "c", { index: 0, parent: null }).nodes)).toEqual(["c", "a", "b"]);
    expect(moveNode(page(), "b", { index: 0, parent: "c" })).toEqual(page());
  });

  it("删除、改 props、找位置", () => {
    expect(ids(removeNode(page(), "c").nodes)).toEqual(["a", "b"]);
    const changed = updateNode(page(), "c", (n) => ({ ...n, props: { label: "x" } }));
    expect(findNode(changed.nodes, "c")).toMatchObject({
      index: 0,
      node: { props: { label: "x" } },
      parent: "b",
    });
  });

  it("存成 JSON 再读回来；格式不对时是 undefined", () => {
    expect(parsePage(serializePage(page()))).toEqual(page());
    expect(parsePage(serializePage(emptyPage()))).toEqual(emptyPage());
    expect(parsePage("{}")).toBeUndefined();
    expect(parsePage("not json")).toBeUndefined();
  });
});
