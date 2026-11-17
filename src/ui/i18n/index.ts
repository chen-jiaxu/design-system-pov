// 界面的语言。选的语言存在浏览器里；没选过时跟着浏览器的语言（日语、中文以外是英语）。
// 组件里用 useMessages()（语言变了会重新渲染），组件外面（提示、检查名字等）用 t()。
import type { Locale } from "../../preview/protocol";
import { createLocalStore } from "../local-store";
import { en } from "./en";
import { ja } from "./ja";
import { type Messages, zh } from "./zh";

export type { Locale, Messages };

const TABLES: Record<Locale, Messages> = { en, ja, zh };

/** 能选的语言，和它们自己的写法（切换的菜单里显示） */
export const LOCALES: [Locale, string][] = [
  ["zh", "中文"],
  ["ja", "日本語"],
  ["en", "English"],
];

/** 浏览器的语言（按喜欢的顺序）→ 界面的语言。日语、中文以外是英语 */
export const localeFor = (languages: readonly string[]): Locale => {
  for (const language of languages) {
    const code = language.toLowerCase();
    if (code.startsWith("ja")) return "ja";
    if (code.startsWith("zh")) return "zh";
    if (code.startsWith("en")) return "en";
  }
  return "en";
};

/** 没选过语言时：跟着浏览器的语言 */
const DEFAULT_LOCALE: Locale = localeFor(
  typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language])
);

const store = createLocalStore<Locale | null>("locale", null);

const current = (chosen: Locale | null): Locale =>
  chosen && chosen in TABLES ? chosen : DEFAULT_LOCALE;

export const getLocale = (): Locale => current(store.get());

export const setLocale = (locale: Locale) => store.set(locale);

export const useLocale = (): Locale => current(store.use());

/** 现在的语言的文字 */
export const t = (): Messages => TABLES[getLocale()];

export const useMessages = (): Messages => TABLES[useLocale()];
