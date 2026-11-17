import { normalize } from "./posix.js";

/**
 * 分析和编译时读文件的入口。文件都在内存里（浏览器的工作区），路径以 / 开头。
 * base 是工作区原本的内容（模板），drafts 是界面里改过、新建的内容，读的时候优先用 drafts。
 */
export interface Files {
  exists: (file: string) => boolean;
  read: (file: string) => string;
  /** 所有文件的路径（不含类型定义） */
  list: () => string[];
  /** 只在草稿里、原本没有的文件（界面里新建的） */
  isDraftOnly: (file: string) => boolean;
}

/** 键是相对路径（src/a.tsx）或绝对路径（/src/a.tsx）都可以 */
const toMap = (files: Readonly<Record<string, string>>) =>
  new Map(Object.entries(files).map(([file, text]) => [normalize(file), text]));

export const createFiles = (
  base: Readonly<Record<string, string>>,
  drafts: Readonly<Record<string, string>> = {}
): Files => {
  const original = toMap(base);
  const overlay = toMap(drafts);
  const all = new Map([...original, ...overlay]);
  return {
    exists: (file) => all.has(normalize(file)),
    isDraftOnly: (file) => overlay.has(normalize(file)) && !original.has(normalize(file)),
    list: () => [...all.keys()].sort(),
    read: (file) => {
      const text = all.get(normalize(file));
      if (text === undefined) throw new Error(`找不到文件 ${file}`);
      return text;
    },
  };
};
