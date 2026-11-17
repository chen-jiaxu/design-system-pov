import { describe, expect, it } from "vitest";

import { en } from "./en";
import { getLocale, localeFor, setLocale, t } from "./index";
import { ja } from "./ja";
import { zh } from "./zh";

/** 把文字的结构摊平成 "app.outliner" 这样的键，值是类型（string 或 function） */
const shape = (messages: object, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) =>
      typeof value === "object"
        ? Object.entries(shape(value as object, `${prefix}${key}.`))
        : [[`${prefix}${key}`, typeof value]]
    )
  );

describe("界面的文字", () => {
  it("三种语言的项目一样多，一样是文字或函数", () => {
    expect(shape(ja)).toEqual(shape(zh));
    expect(shape(en)).toEqual(shape(zh));
  });

  it("日语、英语里没有留着没翻的中文句子", () => {
    // 日语也用汉字，所以只查中文才有的标点和常用字
    const chineseOnly = /[，：；]|[这们个没还]/;
    const texts = (messages: object): string[] =>
      Object.values(messages).flatMap((value) =>
        typeof value === "object"
          ? texts(value as object)
          : [typeof value === "function" ? String(value(2, 1)) : String(value)]
      );
    expect(texts(en).filter((text) => /[぀-ヿ一-鿿]/.test(text))).toEqual([]);
    expect(texts(ja).filter((text) => chineseOnly.test(text.replace(/[：]/g, "")))).toEqual([]);
  });

  it("英语的单复数", () => {
    expect(en.app.draftCount(1)).toBe("1 draft");
    expect(en.app.componentCount(6, 1)).toBe("6 components (1 can't be shown)");
  });

  it("没选过语言时跟着浏览器：日语、中文以外是英语", () => {
    expect(localeFor(["ja-JP", "en-US"])).toBe("ja");
    expect(localeFor(["zh-CN"])).toBe("zh");
    expect(localeFor(["fr-FR", "zh-TW"])).toBe("zh");
    expect(localeFor(["fr-FR"])).toBe("en");
    expect(localeFor([])).toBe("en");
  });

  it("选了语言以后用选的", () => {
    setLocale("zh");
    expect(getLocale()).toBe("zh");
    expect(t().app.outliner).toBe("大纲");
    setLocale("en");
    expect(t().app.outliner).toBe("Outliner");
    setLocale("zh");
  });
});
