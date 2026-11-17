import { describe, expect, it } from "vitest";

import type { ComponentInfo, Manifest } from "../shared/manifest";
import type { CanvasPage } from "./canvas-tree";
import type { DesignToken, TokenScheme } from "./design-tokens";
import { tokenImpact } from "./token-impact";

const token = (name: string, value: string): DesignToken => ({
  description: "",
  id: name,
  name: "",
  token: name,
  type: "color",
  value,
});

const scheme: TokenScheme = {
  groups: [
    {
      id: "g",
      name: "色",
      tokens: [
        token("--brand", "#0f766e"),
        token("--button-bg", "var(--brand)"),
        token("--button-hover", "var(--button-bg)"),
        token("--text", "#18181b"),
      ],
    },
  ],
  id: "s",
  name: "案",
  note: "",
};

const component = (name: string, tokens: string[]): ComponentInfo => ({
  exportName: name,
  file: `src/components/${name}.tsx`,
  inheritedPropCount: 0,
  name,
  props: [],
  styles: [],
  tokens,
});

const manifest = {
  components: [
    component("Button", ["--button-hover"]),
    component("Card", ["--text"]),
    component("Link", ["--brand"]),
  ],
} as Manifest;

const page = (...components: string[]): CanvasPage => ({
  nodes: components.map((c, i) => ({
    children: [],
    component: `src/components/${c}.tsx#${c}`,
    id: `n${i}`,
    props: {},
  })),
  version: 1,
});

describe("token 的影响范围", () => {
  it("引用它的 token 一层层往上找，组件用到其中任何一个都算", () => {
    const impact = tokenImpact("--brand", scheme, manifest, [
      { name: "Home", page: page("Card", "Button") },
      { name: "About", page: page("Card") },
    ]);
    expect(impact.tokens.map((t) => t.token)).toEqual(["--button-bg", "--button-hover"]);
    expect(impact.components.map((c) => c.name)).toEqual(["Button", "Link"]);
    expect(impact.pages).toEqual(["Home"]);
  });

  it("没人用时都是空的", () => {
    expect(tokenImpact("--unused", scheme, manifest)).toEqual({
      components: [],
      pages: [],
      tokens: [],
    });
  });
});
