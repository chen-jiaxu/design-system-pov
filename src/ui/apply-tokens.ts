// 正在使用的 Design Token 方案写进 src/tokens.css。它是全局的 CSS 变量：
// 预览页先加载它，组件的样式和画布上的页面都能用 var(--xxx)；导出 zip、生成的页面也带上它。
import { useEffect, useRef, useSyncExternalStore } from "react";

import type { Manifest } from "../shared/manifest";
import {
  appliedScheme,
  getTokenState,
  initTokenState,
  schemeFromDefinitions,
  TOKEN_FILE,
  toCss,
  useTokenState,
} from "./design-tokens";
import { writeManagedFile } from "./drafts";
import { registerFlush } from "./session";
import { workspace } from "./workspace";

const noop = () => () => {};

export const useApplyTokens = (manifest: Manifest | undefined) => {
  const state = useTokenState();
  // 文件被放弃改动等时也要重新写回去
  const files = useSyncExternalStore(
    workspace?.subscribe ?? noop,
    () => workspace?.getFilesVersion() ?? 0
  );

  // 第一次：用 src/tokens.css 原来定义的变量做第一套方案
  useEffect(() => {
    if (!manifest || getTokenState().schemes.length > 0) return;
    const first = schemeFromDefinitions(manifest.tokens);
    initTokenState({ applied: first.id, schemes: [first] });
  }, [manifest]);

  // 方案改了：稍后写进 src/tokens.css（打字时不用每个字都重新编译）。
  // 这个文件由方案生成，换掉原本的内容，不算草稿
  const pending = useRef<(() => void) | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: files 变了（放弃改动等）也要对一遍
  useEffect(() => {
    const scheme = appliedScheme(state);
    if (!scheme) return;
    const write = () => {
      pending.current = undefined;
      const css = toCss(scheme);
      const current = workspace?.getDraft(TOKEN_FILE) ?? workspace?.original(TOKEN_FILE);
      if (current !== css) writeManagedFile(TOKEN_FILE, css);
    };
    pending.current = write;
    const timer = setTimeout(write, 300);
    return () => clearTimeout(timer);
  }, [state, files]);
  // 关页面、换工作区之前马上写
  useEffect(() => registerFlush(() => pending.current?.()), []);
};
