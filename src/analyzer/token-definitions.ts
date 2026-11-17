import type { TokenDefinition } from "../shared/manifest.js";
import type { Files } from "./files.js";
import { toRelative } from "./posix.js";
import { STYLE_FILE } from "./tokens.js";

/** 找 CSS 文件时跳过的目录 */
const SKIPPED_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", "coverage"]);

const findCssFiles = (files: Files): string[] =>
  files
    .list()
    .filter(
      (file) => STYLE_FILE.test(file) && !file.split("/").some((part) => SKIPPED_DIRS.has(part))
    );

/** 取出 `开头 { ... }` 的内容，支持嵌套的大括号。 */
const readBlocks = (css: string, opening: RegExp): string[] => {
  const blocks: string[] = [];
  for (const match of css.matchAll(opening)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
};

const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;

/** Tailwind v4 的 `@theme { ... }`（也包括 `@theme inline` 等写法） */
const THEME_BLOCK = /@theme\b[^{]*\{/g;
/** 普通 CSS 变量的定义处 `:root { ... }` */
const ROOT_BLOCK = /:root\s*\{/g;

/** 去掉注释。SCSS / Less 还有 `//` 的单行注释（前面是行首或空白的才算，免得把 url 里的 // 去掉） */
const stripComments = (css: string, file: string) => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return file.endsWith(".css") ? text : text.replace(/(^|\s)\/\/[^\n]*/g, "$1");
};

/**
 * 找出工作区里定义的 design token：Tailwind v4 的 `@theme` 和 `:root` 里的 CSS 变量。
 * 组件 CSS 里各自定义的局部变量不在 `:root` 下，不会被算进来。
 */
export const readTokenDefinitions = (files: Files): TokenDefinition[] => {
  const definitions = new Map<string, TokenDefinition>();
  for (const file of findCssFiles(files)) {
    const css = stripComments(files.read(file), file);
    const relative = toRelative(file);
    const blocks: [TokenDefinition["source"], RegExp][] = [
      ["theme", THEME_BLOCK],
      ["root", ROOT_BLOCK],
    ];
    for (const [source, opening] of blocks) {
      for (const block of readBlocks(css, opening)) {
        for (const [, name, value] of block.matchAll(DECLARATION)) {
          if (!name || !value || definitions.has(name)) continue;
          definitions.set(name, { file: relative, name, source, value: value.trim() });
        }
      }
    }
  }
  return [...definitions.values()];
};
