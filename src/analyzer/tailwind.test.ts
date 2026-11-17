import { createRequire } from "node:module";

import type * as TS from "typescript";
import { describe, expect, it } from "vitest";

import { baseClassName, classNamesForToken, readClassNameTokens } from "./tailwind.js";

const ts = createRequire(import.meta.url)("typescript") as typeof TS;

const parse = (code: string) =>
  ts.createSourceFile("Component.tsx", code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

const THEME = ["--color-primary", "--color-primary-hover", "--color-on-primary", "--radius-card"];

describe("classNamesForToken", () => {
  it("颜色对应 bg-、text- 等，圆角对应 rounded-", () => {
    expect(classNamesForToken("--color-primary")).toContain("bg-primary");
    expect(classNamesForToken("--color-primary")).toContain("text-primary");
    expect(classNamesForToken("--radius-card")).toEqual(
      expect.arrayContaining(["rounded-card", "rounded-t-card"])
    );
  });

  it("命名空间不认识的变量没有对应的类名", () => {
    expect(classNamesForToken("--app-radius")).toEqual([]);
  });
});

describe("baseClassName", () => {
  it("去掉变体、! 和透明度", () => {
    expect(baseClassName("hover:bg-primary")).toBe("bg-primary");
    expect(baseClassName("md:dark:text-primary/50")).toBe("text-primary");
    expect(baseClassName("!bg-primary")).toBe("bg-primary");
  });
});

describe("readClassNameTokens", () => {
  it("从 className、对象和模板字符串里找出用到的 theme 变量", () => {
    const source = parse(`
      const VARIANTS = { solid: "bg-primary text-on-primary hover:bg-primary-hover" };
      export const Card = () => <div className={\`rounded-card \${VARIANTS.solid}\`} />;
    `);
    expect(readClassNameTokens(ts, source, THEME).sort()).toEqual([...THEME].sort());
  });

  it("直接写变量的 bg-(--x)、bg-[var(--x)] 也算，没有定义过的不算", () => {
    const source = parse(
      `<div className="bg-(--color-primary) text-[var(--radius-card)] bg-(--other)" />`
    );
    expect(readClassNameTokens(ts, source, THEME).sort()).toEqual([
      "--color-primary",
      "--radius-card",
    ]);
  });

  it("text-on-primary 不会被误认为 --color-primary", () => {
    const source = parse(`<div className="text-on-primary" />`);
    expect(readClassNameTokens(ts, source, THEME)).toEqual(["--color-on-primary"]);
  });
});
