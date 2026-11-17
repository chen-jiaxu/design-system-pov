// 新的工作区的初始内容：templates/starter 下的文件。构建时原样打包进来。
const raw = import.meta.glob<string>("../../templates/starter/**/*", {
  eager: true,
  import: "default",
  query: "?raw",
});

const PREFIX = "../../templates/starter/";

/** 相对路径（如 src/components/button/Button.tsx）→ 内容 */
export const starterFiles: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(raw).map(([file, text]) => [file.slice(PREFIX.length), text])
);

export const STARTER_NAME = "starter";
