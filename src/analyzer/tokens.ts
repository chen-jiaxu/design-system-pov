import type * as TS from "typescript";

import type { Files } from "./files.js";
import { dirname, resolve } from "./posix.js";
import type { TypeScript } from "./typescript.js";

const VAR_PATTERN = /var\(\s*(--[\w-]+)/g;
const DEFINITION_PATTERN = /(--[\w-]+)\s*:/g;

/** 样式文件：CSS，以及要先编译的 SCSS / Sass / Less */
export const STYLE_FILE = /\.(css|scss|sass|less)$/;

/** 组件文件用相对路径 import 的样式文件（绝对路径），按 import 的顺序 */
export const readImportedCss = (ts: TypeScript, source: TS.SourceFile, files: Files): string[] => {
  const found: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!STYLE_FILE.test(specifier) || !specifier.startsWith(".")) {
      continue;
    }
    const cssPath = resolve(dirname(source.fileName), specifier);
    if (files.exists(cssPath)) found.push(cssPath);
  }
  return found;
};

/**
 * 找出组件 import 的样式文件里用到的 CSS 变量，按出现顺序去重。
 * 组件 CSS 自己定义的变量（如 `--_bg: ...`）是组件内部用的，不算 design token。
 */
export const readUsedTokens = (ts: TypeScript, source: TS.SourceFile, files: Files): string[] => {
  const tokens = new Set<string>();
  const defined = new Set<string>();
  for (const cssPath of readImportedCss(ts, source, files)) {
    const css = files.read(cssPath);
    for (const match of css.matchAll(VAR_PATTERN)) tokens.add(match[1] as string);
    for (const match of css.matchAll(DEFINITION_PATTERN)) defined.add(match[1] as string);
  }
  return [...tokens].filter((token) => !defined.has(token));
};
