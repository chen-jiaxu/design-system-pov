import { describe, expect, it } from "vitest";

import { highlight } from "./highlight";

/** 只看有颜色的词，方便比较 */
const colored = (code: string) =>
  highlight(code).map((line) =>
    line.filter((t) => t.kind !== "plain").map((t) => `${t.kind}:${t.text}`)
  );

describe("highlight", () => {
  it("关键字、字符串、类型、数字", () => {
    expect(colored('import type { ReactNode } from "react";\nconst size = 40;')).toEqual([
      ["control:import", "keyword:type", "type:ReactNode", "control:from", 'string:"react"'],
      ["keyword:const", "number:40"],
    ]);
  });

  it("JSX：小写标签、组件、属性名", () => {
    expect(
      colored('<span className="app" data-tone={tone}>\n  <Card title="x" />\n</span>')
    ).toEqual([
      ["tag:span", "attr:className", 'string:"app"', "attr:data-tone"],
      ["type:Card", "attr:title", 'string:"x"'],
      ["tag:span"],
    ]);
  });

  it("标签中间的文字不着色，换行写的也一样", () => {
    expect(colored("<Card>Card for you</Card>")).toEqual([["type:Card", "type:Card"]]);
    expect(colored('<Button size="sm">\n  Save in Draft\n</Button>')).toEqual([
      ["type:Button", "attr:size", 'string:"sm"'],
      [],
      ["type:Button"],
    ]);
    // 泛型的 > 后面不是文字
    expect(colored("useState<Tone>(first)")).toEqual([["type:Tone"]]);
  });

  it("函数调用、注释；跨行的注释按行拆开", () => {
    expect(colored("/** 说明\n * 第二行 */\nuseState(false); // 结尾")).toEqual([
      ["comment:/** 说明"],
      ["comment: * 第二行 */"],
      ["function:useState", "keyword:false", "comment:// 结尾"],
    ]);
  });

  it("行数和原文一致，拼回去和原文相同", () => {
    const code = "const a = `多行\n模板`;\n\nexport default a;\n";
    const lines = highlight(code);
    expect(lines.map((line) => line.map((t) => t.text).join("")).join("\n")).toBe(code);
  });
});

describe("highlight（CSS）", () => {
  const css = (code: string) =>
    highlight(code, "css").map((line) =>
      line.filter((t) => t.kind !== "plain").map((t) => `${t.kind}:${t.text}`)
    );

  it("选择器、属性名、值、变量、注释", () => {
    expect(
      css(
        '/* 按钮 */\n.app-button[data-variant="solid"]:hover {\n  --_bg: #0f766e;\n  padding: 0 var(--app-space);\n  color: transparent;\n}'
      )
    ).toEqual([
      ["comment:/* 按钮 */"],
      ["selector:app-button", "selector:data-variant", 'string:"solid"', "selector:hover"],
      ["attr:--_bg", "string:#0f766e"],
      ["attr:padding", "number:0", "function:var", "attr:--app-space"],
      ["attr:color", "string:transparent"],
      [],
    ]);
  });

  it("@规则，以及嵌套在里面的规则", () => {
    expect(css("@media (min-width: 600px) {\n  .a { margin: 4px; }\n}")).toEqual([
      ["control:@media", "selector:min-width", "number:600px"],
      ["selector:a", "attr:margin", "number:4px"],
      [],
    ]);
  });

  it("SCSS：// 注释、$变量、@规则、嵌套的选择器", () => {
    const code =
      "// 说明\n$gap: 4px;\n.tag {\n  @include pill($gap);\n  &:hover { color: red; }\n}";
    expect(
      highlight(code, "scss").map((line) =>
        line.filter((t) => t.kind !== "plain").map((t) => `${t.kind}:${t.text}`)
      )
    ).toEqual([
      ["comment:// 说明"],
      ["attr:$gap", "number:4px"],
      ["selector:tag"],
      ["control:@include", "function:pill", "attr:$gap"],
      ["selector:hover", "attr:color", "string:red"],
      [],
    ]);
  });

  it("Less：@变量和 @规则分开着色；CSS 里的 // 不是注释", () => {
    const less = highlight("@line: 4px;\n@media print { .a { width: @line; } }", "less");
    expect(less[0]?.[0]).toEqual({ kind: "attr", text: "@line" });
    expect(less[1]?.[0]).toEqual({ kind: "control", text: "@media" });
    expect(less[1]?.some((t) => t.kind === "attr" && t.text === "@line")).toBe(true);
    expect(highlight("a { b: c } // x", "css")[0]?.some((t) => t.kind === "comment")).toBe(false);
  });
});
