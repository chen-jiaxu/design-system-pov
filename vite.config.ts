import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { loadTypeLibs } from "./src/analyzer/type-libs.node.ts";

const TYPE_LIBS = "virtual:type-libs";

/** 开发服务器：沙箱里的预览页（origin 是 "null"）加载脚本时要允许跨域。GitHub Pages 本来就允许 */
const LOCAL_CORS = {
  origin: [/^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/, "null"],
};

/** 分析用的类型定义（TypeScript 的 lib、React 的类型）打包成一个模块，Worker 第一次分析时加载 */
const typeLibs = (): Plugin => ({
  load(id) {
    if (id !== `\0${TYPE_LIBS}`) return undefined;
    const libs = loadTypeLibs(path.resolve(import.meta.dirname, "node_modules"));
    return `export default ${JSON.stringify(libs)};`;
  },
  name: "design-system-pov:type-libs",
  resolveId(id) {
    return id === TYPE_LIBS ? `\0${TYPE_LIBS}` : undefined;
  },
});

// 界面和预览页都是静态文件，build 后放到 GitHub Pages 这样的地方就能用。
// 部署的路径（如 /design-system-pov/）用环境变量 VITE_BASE 指定（默认值在 .env，执行时设的优先）
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, import.meta.dirname, "VITE_").VITE_BASE || "/",
  build: {
    outDir: "dist",
    rolldownOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        preview: path.resolve(import.meta.dirname, "preview.html"),
      },
    },
  },
  plugins: [react(), typeLibs()],
  server: {
    cors: LOCAL_CORS,
    port: 5181,
    strictPort: true,
  },
  worker: {
    format: "es",
    plugins: () => [typeLibs()],
  },
}));
