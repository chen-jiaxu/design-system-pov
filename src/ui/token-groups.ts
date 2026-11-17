import type { TokenDefinition } from "../shared/manifest";
import { t } from "./i18n";

export type TokenKind = "color" | "length" | "duration" | "number" | "font" | "other";

const KIND_ORDER: TokenKind[] = ["color", "length", "font", "duration", "number", "other"];

const COLOR_VALUE =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(|transparent$|currentcolor$|white$|black$)/i;

/** `var(--x)` 引用的变量名 */
const referenceOf = (value: string) => /^var\(\s*(--[\w-]+)\s*(,[^)]*)?\)$/.exec(value)?.[1];

/** 顺着 `var(--x)` 找到最终的值。找不到或循环引用时返回原值。 */
export const resolveValue = (value: string, tokens: TokenDefinition[]): string => {
  const byName = new Map(tokens.map((t) => [t.name, t.value]));
  const seen = new Set<string>();
  let current = value;
  for (let ref = referenceOf(current); ref && !seen.has(ref); ref = referenceOf(current)) {
    seen.add(ref);
    const next = byName.get(ref);
    if (next === undefined) break;
    current = next;
  }
  return current;
};

/** 按名字和值判断 token 的种类。 */
export const tokenKind = (token: TokenDefinition, tokens: TokenDefinition[]): TokenKind => {
  const value = resolveValue(token.value, tokens).trim();
  if (COLOR_VALUE.test(value) || /(^|-)color(-|$)/.test(token.name)) return "color";
  if (/(^|-)(font|family)(-|$)/.test(token.name) && /[a-z"']/i.test(value)) return "font";
  if (/^-?[\d.]+(px|rem|em|%|vh|vw|ch|ex)$/.test(value)) return "length";
  if (/^[\d.]+m?s$/.test(value)) return "duration";
  if (/^-?[\d.]+$/.test(value)) return "number";
  return "other";
};

export interface TokenGroup {
  kind: TokenKind;
  label: string;
  tokens: TokenDefinition[];
}

/** 按种类分组，空的组不返回。组内保持定义的顺序。 */
export const groupTokens = (tokens: TokenDefinition[]): TokenGroup[] =>
  KIND_ORDER.map((kind) => ({
    kind,
    label: t().tokenKind[kind],
    tokens: tokens.filter((token) => tokenKind(token, tokens) === kind),
  })).filter((group) => group.tokens.length > 0);
