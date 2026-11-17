// 改一个 token 会影响到哪里：引用它的 token（一层层往上找）、用到它们的组件、放了这些组件的页面。
import type { ComponentInfo, Manifest } from "../shared/manifest";
import type { CanvasPage } from "./canvas-tree";
import { allNodes } from "./canvas-tree";
import { allTokens, type DesignToken, referenceOf, type TokenScheme } from "./design-tokens";
import { componentId } from "./selection";

export interface TokenImpact {
  /** 引用它的 token（直接、间接） */
  tokens: DesignToken[];
  /** 用到它（或引用它的 token）的组件 */
  components: ComponentInfo[];
  /** 放了这些组件的页面 */
  pages: string[];
}

export const tokenImpact = (
  name: string,
  scheme: TokenScheme | undefined,
  manifest: Manifest | undefined,
  pages: { name: string; page: CanvasPage }[] = []
): TokenImpact => {
  const tokens = allTokens(scheme);
  // 顺着引用往上找：--button-bg: var(--brand) 时，改 --brand 也会改到 --button-bg
  const names = new Set([name]);
  const referring: DesignToken[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const token of tokens) {
      const ref = referenceOf(token.value);
      if (!ref || !names.has(ref) || names.has(token.token)) continue;
      names.add(token.token);
      referring.push(token);
      grew = true;
    }
  }
  const components = (manifest?.components ?? []).filter((c) =>
    c.tokens.some((used) => names.has(used))
  );
  const ids = new Set(components.map(componentId));
  return {
    components,
    pages: pages
      .filter(({ page }) => allNodes(page.nodes).some((node) => ids.has(node.component)))
      .map(({ name: pageName }) => pageName),
    tokens: referring,
  };
};
