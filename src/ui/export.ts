// 工作区导出成 zip、从 zip 导入：全部文件（改过的内容已经放进去），加上 Design Token 的全部方案。
import { APP_NAME } from "../shared/app";
import { createZip } from "../shared/zip";
import { t } from "./i18n";

/** zip 里放 Design Token 全部方案的文件。导入时用它恢复方案 */
export const TOKENS_FILE = "design-tokens.json";
const README = "README.txt";

/** zip 里放哪些文件。路径 → 内容 */
export const exportFiles = (
  project: string,
  /** 工作区的全部文件：路径 → 内容 */
  files: Record<string, string>,
  /** 其中改过、新建的文件 */
  changed: string[],
  /** Design Token 的全部方案（工作区里存的样子） */
  tokens?: unknown
): Record<string, string> => {
  const m = t().export;
  const lines = [
    m.title(APP_NAME, project),
    "",
    m.filesUsage,
    "",
    ...(changed.length > 0 ? [m.filesIntro, ...changed.map((file) => `- ${file}`), ""] : []),
    ...(tokens ? [m.tokensNote(TOKENS_FILE), ""] : []),
  ];
  return {
    ...files,
    ...(tokens ? { [TOKENS_FILE]: `${JSON.stringify(tokens, null, 2)}\n` } : {}),
    [README]: lines.join("\n"),
  };
};

/**
 * 从 zip 读回工作区：说明文件、旧版本的 Mock 数据不要；design-tokens.json 变回方案。
 * 一个源码文件也没有时返回 undefined（不是这里导出的 zip）
 */
export const importFiles = (
  zip: Record<string, string>
): { files: Record<string, string>; tokens?: unknown } | undefined => {
  const files: Record<string, string> = {};
  let tokens: unknown;
  for (const [path, text] of Object.entries(zip)) {
    // 有的压缩工具会多包一层文件夹、加上 __MACOSX：去掉
    if (path.startsWith("__MACOSX/") || path.endsWith(".DS_Store")) continue;
    if (path === README || path.startsWith("mocks/")) continue;
    if (path === TOKENS_FILE) {
      try {
        tokens = JSON.parse(text);
      } catch {
        // 读不出就当作没有方案，打开时按 src/tokens.css 重新建
      }
      continue;
    }
    files[path] = text;
  }
  if (!Object.keys(files).some((path) => /\.(tsx?|css)$/.test(path))) return undefined;
  return { files, tokens };
};

/** 让浏览器把 zip 下载下来 */
export const downloadZip = (name: string, files: Record<string, string>) => {
  const url = URL.createObjectURL(
    new Blob([createZip(files).buffer as ArrayBuffer], { type: "application/zip" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
