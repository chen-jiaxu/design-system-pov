// 从本仓库的 node_modules 读出分析要用的类型定义（Node 里运行）。
// 构建时由 vite.config.ts 的插件打包给浏览器，测试时直接用。
import fs from "node:fs";
import path from "node:path";

import type { TypeLibs } from "./typescript.js";

/** TypeScript 自带的 lib：LIBS（见 typescript.ts）和它们引用的 */
const LIB_FILE =
  /^lib\.(es5|es20(1[5-9]|2[0-2])(\..+)?|decorators(\..+)?|dom|dom\.iterable)\.d\.ts$/;

/** 每个包带哪些文件。React 的类型只带顶层的（ts5.0/ 是给旧版 TypeScript 的） */
const PACKAGES: [string, RegExp][] = [
  ["typescript/lib", LIB_FILE],
  ["@types/react", /^([\w-]+\.d\.ts|package\.json)$/],
  ["csstype", /^(index\.d\.ts|package\.json)$/],
];

export const loadTypeLibs = (nodeModules: string): TypeLibs => {
  const libs: Record<string, string> = {};
  for (const [dir, pattern] of PACKAGES) {
    for (const name of fs.readdirSync(path.join(nodeModules, dir)).sort()) {
      if (!pattern.test(name)) continue;
      libs[`/node_modules/${dir}/${name}`] = fs.readFileSync(
        path.join(nodeModules, dir, name),
        "utf8"
      );
    }
  }
  return libs;
};

/** 测试用：把一个目录下的文件读成工作区的样子（路径 → 内容）。跳过 node_modules 等 */
export const readDirectory = (root: string): Record<string, string> => {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", "dist", ".git"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        files[path.relative(root, file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
    }
  };
  walk(root);
  return files;
};
