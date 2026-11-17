// 编译时的提示（界面会直接显示）。语言跟着界面。
import type { Locale } from "../preview/protocol";
import type { CompileMessages } from "./compile";

const zh: CompileMessages = {
  compileError: (file, line, reason) => `${file} 第 ${line} 行：${reason}`,
  unsupportedStyle: (file) => `${file}：SCSS、Sass、Less 还不能在预览里用，请改用 CSS`,
};

const ja: CompileMessages = {
  compileError: (file, line, reason) => `${file} の ${line} 行目：${reason}`,
  unsupportedStyle: (file) =>
    `${file}：SCSS、Sass、Less はまだプレビューで使えません。CSS に書き換えてください`,
};

const en: CompileMessages = {
  compileError: (file, line, reason) => `${file} line ${line}: ${reason}`,
  unsupportedStyle: (file) =>
    `${file}: SCSS, Sass and Less cannot be previewed yet. Please use CSS instead`,
};

const TABLES: Record<Locale, CompileMessages> = { en, ja, zh };

/** 不认识的语言、没有带语言时用中文 */
export const compileMessagesFor = (locale: string | undefined): CompileMessages =>
  TABLES[locale as Locale] ?? zh;
