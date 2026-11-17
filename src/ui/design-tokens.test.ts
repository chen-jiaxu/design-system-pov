import { describe, expect, it } from "vitest";

import {
  counterpart,
  type DesignToken,
  deltaText,
  duplicateScheme,
  formatDate,
  freeSchemeName,
  guessType,
  parseTable,
  renameReferences,
  renameTokenEverywhere,
  resolveToken,
  schemeFromDefinitions,
  schemeStatus,
  statusText,
  TOKEN_FILE,
  type TokenScheme,
  toCss,
  toMarkdown,
  toTokensJson,
  withStatus,
} from "./design-tokens";
import { setLocale } from "./i18n";

setLocale("zh");

const token = (
  value: string,
  name: string,
  type: DesignToken["type"] = "color",
  extra: Partial<DesignToken> = {}
): DesignToken => ({ description: "", id: name, name: "", token: name, type, value, ...extra });

const scheme: TokenScheme = {
  confirmed: true,
  groups: [
    {
      id: "g1",
      name: "品牌",
      tokens: [
        token("#175AA7", "--brand-600", "color", { description: "主按钮", name: "主色" }),
        token("var(--brand-600)", "--primary"),
      ],
    },
    {
      id: "g2",
      name: "尺寸",
      tokens: [token("8px", "--radius", "dimension"), token("1px", "bad name", "dimension")],
    },
  ],
  id: "s",
  name: "B",
  note: "推荐",
};

describe("design tokens", () => {
  it("顺着 var() 找到最终的值；找不到、互相引用时是 undefined", () => {
    const tokens = scheme.groups.flatMap((g) => g.tokens);
    expect(resolveToken("var(--primary)", tokens)).toBe("#175AA7");
    expect(resolveToken("var(--nope)", tokens)).toBeUndefined();
    expect(resolveToken("var(--a)", [token("var(--b)", "--a"), token("var(--a)", "--b")])).toBe(
      undefined
    );
  });

  it("CSS：:root 里的变量，按分组写注释；变量名不对的不写", () => {
    expect(toCss(scheme)).toBe(`/* B：推荐（由 Design Token 的界面生成） */
:root {
  /* 品牌 */
  --brand-600: #175AA7; /* 主色：主按钮 */
  --primary: var(--brand-600);
  /* 尺寸 */
  --radius: 8px;
}
`);
  });

  it("JSON（Design Tokens 的格式）：引用写成 {名字}", () => {
    expect(JSON.parse(toTokensJson(scheme))).toEqual({
      $description: "B：推荐",
      // 以前存的 confirmed: true 算已批准
      $extensions: { "design-system-pov": { status: "approved" } },
      品牌: {
        "brand-600": { $description: "主色：主按钮", $type: "color", $value: "#175AA7" },
        primary: { $type: "color", $value: "{brand-600}" },
      },
      尺寸: {
        "bad name": { $type: "dimension", $value: "1px" },
        radius: { $type: "dimension", $value: "8px" },
      },
    });
  });

  it("比较：同一个变量名的颜色算 ΔE，Markdown 里带上", () => {
    const copy = duplicateScheme(scheme, "A");
    const other: TokenScheme = {
      ...copy,
      groups: copy.groups.map((g) => ({
        ...g,
        tokens: g.tokens.map((t) => (t.token === "--brand-600" ? { ...t, value: "#205290" } : t)),
      })),
    };
    const tokens = scheme.groups.flatMap((g) => g.tokens);
    const otherTokens = other.groups.flatMap((g) => g.tokens);
    const primary = tokens[1] as DesignToken;
    expect(deltaText(primary, tokens, counterpart(primary, other), otherTokens)).toBe("0.040");
    const md = toMarkdown(scheme, other);
    expect(md).toContain(
      "| 主色 | `--brand-600` | `#175AA7` | 0.47 / 0.140 / 255 | 6.87:1（可用作文字） | 主按钮 | 0.040 |"
    );
    expect(md).toContain("| 名字 | 变量名 | 值 | 用途・说明 |");
  });

  it("从表格粘贴：颜色和尺寸、时长都认，算出来的列不算", () => {
    const found = parseTable(
      [
        "| 色 | 名前 | トークン | 値 | OKLCH | コントラスト | 用途 |",
        "|  | 主色 | `--brand-600 / --primary` | `#2A579A` | 0.46 / 0.120 / 258 | 7.17:1（文字に可） | 主ボタン |",
        "\t卡片圆角\t--radius-card\t12px\t卡片",
        "\t动画\t--duration-fast\t120ms\t悬停",
        "没有值的行",
      ].join("\n")
    );
    expect(found.map((t) => [t.name, t.token, t.type, t.value, t.description])).toEqual([
      ["主色", "--brand-600", "color", "#2A579A", "主ボタン"],
      ["卡片圆角", "--radius-card", "dimension", "12px", "卡片"],
      ["动画", "--duration-fast", "duration", "120ms", "悬停"],
    ]);
  });

  it("第一套方案：读 src/tokens.css 的变量，按种类分组；别的文件的不算", () => {
    const first = schemeFromDefinitions([
      { file: TOKEN_FILE, name: "--app-color-primary", source: "root", value: "#0f766e" },
      { file: TOKEN_FILE, name: "--app-color-success", source: "root", value: "#15803d" },
      { file: TOKEN_FILE, name: "--app-color-text", source: "root", value: "#18181b" },
      { file: TOKEN_FILE, name: "--app-radius", source: "root", value: "8px" },
      { file: TOKEN_FILE, name: "--app-duration", source: "root", value: "120ms" },
      { file: "src/other.css", name: "--x", source: "root", value: "#000" },
    ]);
    expect(
      first.groups.map((g) => [g.name, g.tokens.map((t) => [t.token, t.type, t.value])])
    ).toEqual([
      ["品牌", [["--app-color-primary", "color", "#0F766E"]]],
      ["状态", [["--app-color-success", "color", "#15803D"]]],
      ["中性", [["--app-color-text", "color", "#18181B"]]],
      ["尺寸", [["--app-radius", "dimension", "8px"]]],
      ["动效", [["--app-duration", "duration", "120ms"]]],
    ]);
  });

  it("按名字和值猜种类", () => {
    expect(guessType("--font-weight-bold", "700")).toBe("fontWeight");
    expect(guessType("--shadow-card", "0 1px 2px rgb(0 0 0 / 10%)")).toBe("shadow");
    expect(guessType("--font-body", "system-ui, sans-serif")).toBe("fontFamily");
    expect(guessType("--line-height", "1.5")).toBe("number");
  });

  it("改变量名：所有方案的同名 token 和 var() 引用一起改，名字相近的不动", () => {
    const copy = duplicateScheme(scheme, "A");
    const renamed = renameTokenEverywhere(
      { schemes: [scheme, copy] },
      "--brand-600",
      "--brand-main"
    );
    for (const s of renamed.schemes) {
      const tokens = s.groups.flatMap((g) => g.tokens);
      expect(tokens.map((t) => t.token)).toContain("--brand-main");
      expect(tokens.find((t) => t.token === "--primary")?.value).toBe("var(--brand-main)");
    }
    expect(
      renameReferences(
        ".a { color: var(--brand-600); background: var(--brand-600-soft); border: var( --brand-600 , red); }",
        "--brand-600",
        "--brand-main"
      )
    ).toBe(
      ".a { color: var(--brand-main); background: var(--brand-600-soft); border: var(--brand-main , red); }"
    );
  });

  it("方案的状态：以前的 confirmed 也能读；改状态记下时间；复制出来的从草稿开始", () => {
    expect(schemeStatus(scheme)).toBe("approved");
    expect(schemeStatus({ ...scheme, confirmed: false })).toBe("draft");
    const at = new Date(2026, 10, 17, 9, 30).getTime();
    const reviewing = withStatus(scheme, "review", at);
    expect(reviewing).toMatchObject({ status: "review", statusAt: at });
    expect("confirmed" in reviewing).toBe(false);
    expect(formatDate(at)).toBe("2026-11-17");
    expect(statusText(reviewing)).toBe("评审中（2026-11-17）");
    expect(toMarkdown(reviewing)).toContain("状态：评审中（2026-11-17）");
    const copy = duplicateScheme(reviewing, "C");
    expect(copy.status).toBe("draft");
    expect(copy.statusAt).toBeUndefined();
  });

  it("同名的方案：后面加上标记，还重就加数字", () => {
    expect(freeSchemeName("案 B", ["案 A"], "（共有）")).toBe("案 B");
    expect(freeSchemeName("案 A", ["案 A"], "（共有）")).toBe("案 A（共有）");
    expect(freeSchemeName("案 A", ["案 A", "案 A（共有）"], "（共有）")).toBe("案 A（共有）2");
  });
});
