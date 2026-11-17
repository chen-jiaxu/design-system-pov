import type * as TS from "typescript";

import type { TypeScript } from "./typescript.js";

/**
 * Tailwind v4 的 theme 变量和工具类的对应关系：`--{命名空间}-{名字}` 对应 `{前缀}-{名字}`。
 * 例：`--color-primary` 对应 `bg-primary`、`text-primary`；`--radius-card` 对应 `rounded-card`。
 */
const UTILITY_PREFIXES: Record<string, string[]> = {
  animate: ["animate"],
  aspect: ["aspect"],
  blur: ["blur", "backdrop-blur"],
  color: [
    "bg",
    "text",
    "border",
    "border-x",
    "border-y",
    "border-t",
    "border-r",
    "border-b",
    "border-l",
    "border-s",
    "border-e",
    "outline",
    "ring",
    "ring-offset",
    "inset-ring",
    "fill",
    "stroke",
    "decoration",
    "accent",
    "caret",
    "shadow",
    "inset-shadow",
    "drop-shadow",
    "divide",
    "placeholder",
    "from",
    "via",
    "to",
  ],
  "drop-shadow": ["drop-shadow"],
  ease: ["ease"],
  font: ["font"],
  "font-weight": ["font"],
  "inset-shadow": ["inset-shadow"],
  leading: ["leading"],
  radius: [
    "rounded",
    "rounded-t",
    "rounded-r",
    "rounded-b",
    "rounded-l",
    "rounded-tl",
    "rounded-tr",
    "rounded-br",
    "rounded-bl",
    "rounded-s",
    "rounded-e",
  ],
  shadow: ["shadow"],
  text: ["text"],
  tracking: ["tracking"],
};

const NAMESPACES = Object.keys(UTILITY_PREFIXES).sort((a, b) => b.length - a.length);

/** 一个 theme 变量能写成哪些类名。命名空间不认识的返回空数组。 */
export const classNamesForToken = (token: string): string[] => {
  const name = token.replace(/^--/, "");
  const namespace = NAMESPACES.find((ns) => name.startsWith(`${ns}-`));
  if (!namespace) return [];
  const rest = name.slice(namespace.length + 1);
  return (UTILITY_PREFIXES[namespace] ?? []).map((prefix) => `${prefix}-${rest}`);
};

/** 去掉 `hover:`、`md:` 等变体、`!` 和 `/50` 这样的透明度，只留工具类本身。 */
export const baseClassName = (className: string): string =>
  (className.split(":").at(-1) ?? "").replace(/^!|!$/g, "").replace(/\/[\w.]+$/, "");

/** 取出源码里所有字符串（类名可能写在 className 上，也可能写在对象、模板字符串里）。 */
const readStrings = (ts: TypeScript, source: TS.SourceFile): string[] => {
  const strings: string[] = [];
  const visit = (node: TS.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      strings.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return strings;
};

/**
 * 找出组件的类名里用到的 theme 变量。
 * 只认项目 `@theme` 里定义过的变量；`bg-(--color-x)`、`bg-[var(--color-x)]` 这样直接写变量的也算。
 */
export const readClassNameTokens = (
  ts: TypeScript,
  source: TS.SourceFile,
  themeTokens: string[]
): string[] => {
  if (themeTokens.length === 0) return [];
  const byClassName = new Map<string, string>();
  for (const token of themeTokens) {
    for (const className of classNamesForToken(token)) byClassName.set(className, token);
  }
  const defined = new Set(themeTokens);

  const found = new Set<string>();
  for (const text of readStrings(ts, source)) {
    for (const className of text.split(/\s+/)) {
      if (!className) continue;
      const token = byClassName.get(baseClassName(className));
      if (token) found.add(token);
      for (const [variable] of className.matchAll(/--[\w-]+/g)) {
        if (defined.has(variable)) found.add(variable);
      }
    }
  }
  return [...found];
};
