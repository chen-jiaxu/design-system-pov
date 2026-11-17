// 工作区里的路径：都是以 / 开头的 POSIX 写法（如 /src/components/Button.tsx）。
// 浏览器里没有 node:path，这里只放分析和编译用到的几个。

/** 去掉多余的 `.`、`..` 和连续的斜杠 */
export const normalize = (file: string): string => {
  const parts: string[] = [];
  for (const part of file.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
};

export const dirname = (file: string): string => {
  const index = file.lastIndexOf("/");
  return index <= 0 ? "/" : file.slice(0, index);
};

export const basename = (file: string, extension = ""): string => {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return extension && name.endsWith(extension) ? name.slice(0, -extension.length) : name;
};

/** 从 from 所在的目录看 specifier 指向哪里（specifier 以 / 开头时就是它自己） */
export const resolve = (directory: string, specifier: string): string =>
  normalize(specifier.startsWith("/") ? specifier : `${directory}/${specifier}`);

/** 工作区里的路径 → 组件清单里用的写法（不带开头的 /） */
export const toRelative = (file: string): string => file.replace(/^\/+/, "");

/** 组件清单里的写法 → 工作区里的路径 */
export const toAbsolute = (file: string): string => normalize(file);
