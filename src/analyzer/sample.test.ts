import { createRequire } from "node:module";

import type * as TS from "typescript";
import { describe, expect, it } from "vitest";

import { NO_SAMPLE, sampleOf } from "./sample.js";

const ts = createRequire(import.meta.url)("typescript") as typeof TS;

/** 标准库的类型定义（lib.dom.d.ts 等）很大，各个用例共用读好的，不每次重新解析 */
const libs = new Map<string, TS.SourceFile | undefined>();

/** 取出 `type T = ...` 的类型，生成示例 */
const sample = (definition: string) => {
  const file = "/sample.ts";
  const host = ts.createCompilerHost({});
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (name, version, ...rest) => {
    if (name === file) return ts.createSourceFile(name, definition, version, true);
    if (!libs.has(name)) libs.set(name, getSourceFile.call(host, name, version, ...rest));
    return libs.get(name);
  };
  const program = ts.createProgram([file], { strict: true }, host);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file) as TS.SourceFile;
  const alias = source.statements.find(
    (s): s is TS.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "T"
  ) as TS.TypeAliasDeclaration;
  return sampleOf(ts, checker, checker.getTypeFromTypeNode(alias.type), alias, "value");
};

describe("sampleOf", () => {
  it("基本类型、字面量、联合类型", () => {
    expect(sample("type T = string")).toBe("value");
    expect(sample("type T = number | undefined")).toBe(1);
    expect(sample('type T = "a" | "b"')).toBe("a");
    expect(sample("type T = (() => void) | string")).toBe("value");
  });

  it("对象：可选的属性也填上；嵌套的数组带序号", () => {
    expect(
      sample("type T = { title: string; count?: number; tags: string[]; pos: [number, number] }")
    ).toEqual({ count: 1, pos: [1, 2], tags: ["tags 1", "tags 2"], title: "title" });
    expect(sample("type T = Record<string, number>")).toEqual({ key: 1 });
  });

  it("写不成 JSON 的：必填的函数、Date 生成不出来；可选的跳过；数组里的给空数组", () => {
    expect(sample("type T = { onSave: () => void }")).toBe(NO_SAMPLE);
    expect(sample("type T = Date")).toBe(NO_SAMPLE);
    expect(sample("type T = { name: string; onSave?: () => void }")).toEqual({ name: "name" });
    expect(sample("type T = Date[]")).toEqual([]);
  });

  it("树形的类型不会一直套下去", () => {
    const tree = sample("interface Tree { name: string; children?: Tree[] }\ntype T = Tree") as {
      children: unknown[];
    };
    expect(JSON.stringify(tree).length).toBeLessThan(2000);
    expect(tree.children).toHaveLength(2);
  });
});
