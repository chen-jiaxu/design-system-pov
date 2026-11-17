import { describe, expect, it } from "vitest";

import type { TokenDefinition } from "../shared/manifest";
import { setLocale } from "./i18n";
import { groupTokens, resolveValue, tokenKind } from "./token-groups";

// 别的测试可能换过语言，这里固定用中文
setLocale("zh");

const token = (name: string, value: string): TokenDefinition => ({
  file: "src/tokens.css",
  name,
  source: "root",
  value,
});

const TOKENS = [
  token("--app-color-primary", "#0f766e"),
  token("--app-radius", "8px"),
  token("--app-duration", "120ms"),
  token("--app-press-scale", "0.98"),
  token("--app-font-family", '"Inter", sans-serif'),
  token("--app-color-link", "var(--app-color-primary)"),
  token("--app-shadow", "0 1px 2px rgb(0 0 0 / 10%)"),
];

describe("tokenKind", () => {
  it("按值和名字判断种类", () => {
    const kinds = Object.fromEntries(TOKENS.map((t) => [t.name, tokenKind(t, TOKENS)]));
    expect(kinds).toEqual({
      "--app-color-link": "color",
      "--app-color-primary": "color",
      "--app-duration": "duration",
      "--app-font-family": "font",
      "--app-press-scale": "number",
      "--app-radius": "length",
      "--app-shadow": "other",
    });
  });
});

describe("resolveValue", () => {
  it("顺着 var() 找到最终的值，找不到时保留原值", () => {
    expect(resolveValue("var(--app-color-primary)", TOKENS)).toBe("#0f766e");
    expect(resolveValue("var(--missing)", TOKENS)).toBe("var(--missing)");
  });

  it("循环引用时不会卡住", () => {
    const loop = [token("--a", "var(--b)"), token("--b", "var(--a)")];
    expect(resolveValue("var(--a)", loop)).toBe("var(--a)");
  });
});

describe("groupTokens", () => {
  it("按种类分组，空的组不返回", () => {
    const groups = groupTokens(TOKENS);
    expect(groups.map((g) => [g.label, g.tokens.length])).toEqual([
      ["颜色", 2],
      ["尺寸", 1],
      ["字体", 1],
      ["时长", 1],
      ["数值", 1],
      ["其他", 1],
    ]);
    expect(groupTokens([])).toEqual([]);
  });
});
