// 预览页（preview.html）的入口：带上 React，等界面把编译好的工作区交过来，再开始渲染。
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";

import { texts } from "./messages";
import { createModuleSystem, type ModuleSystem } from "./modules";
import type { ModulesMessage } from "./protocol";
import { type PreviewHandle, startPreview } from "./runtime";

/** 组件能 import 的包 */
const externals: Record<string, unknown> = {
  react: React,
  "react-dom": ReactDOM,
  "react-dom/client": ReactDOMClient,
  "react/jsx-runtime": jsxRuntime,
};

// 告诉界面脚本能跑（沙箱里的预览页被浏览器挡住时，界面收不到这个，会改用不带沙箱的）
window.parent.postMessage({ type: "dsp:alive" }, "*");

let system: ModuleSystem | undefined;
let preview: PreviewHandle | undefined;

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window.parent) return;
  const data = event.data as ModulesMessage | undefined;
  if (data?.type !== "dsp:modules") return;

  // 换成新的内容：旧的样式去掉，模块重新执行
  system?.dispose();
  const current = createModuleSystem({
    externals,
    modules: data.modules,
    unknownModule: (specifier, from) => texts().unknownModule(specifier, from),
  });
  system = current;
  const loaders = Object.fromEntries(
    data.components.map((file) => [file, async () => current.require(file)])
  );
  const styles = data.styles.map((file) => async () => current.require(file));

  if (preview) preview.update({ loaders, styles });
  else preview = startPreview({ React, createRoot: ReactDOMClient.createRoot, loaders, styles });
});
