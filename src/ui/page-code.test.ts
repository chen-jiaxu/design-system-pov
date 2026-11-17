import { describe, expect, it } from "vitest";

import type { ComponentInfo, Manifest, PropInfo } from "../shared/manifest";
import type { CanvasPage } from "./canvas-tree";
import { pageNameOf, relativeImport, toPageCode } from "./page-code";

const children: PropInfo = { control: { kind: "slot" }, name: "children", required: false };
const component = (
  name: string,
  file: string,
  props: PropInfo[],
  exportName = name
): ComponentInfo => ({
  exportName,
  file,
  inheritedPropCount: 0,
  name,
  props,
  styles: [],
  tokens: [],
});

const manifest: Manifest = {
  components: [
    component("Card", "src/components/card/Card.tsx", [
      { control: { kind: "text" }, name: "title", required: true },
      children,
    ]),
    component("Button", "src/components/button/Button.tsx", [children]),
    component("Badge", "src/components/badge/Badge.tsx", [], "default"),
    component("Button", "src/other/Button.tsx", [children]),
    component("UserTable", "src/components/user-table/UserTable.tsx", [
      { control: { kind: "data", sample: [], type: "User[]" }, name: "users", required: true },
    ]),
  ],
  componentsDir: "src/components",
  providers: [],
  root: "demo",
  tailwind: false,
  tokens: [{ file: "src/tokens.css", name: "--x", source: "root", value: "1px" }],
};

describe("toPageCode", () => {
  it("组件按树写成 JSX，带上 import、定义 token 的样式和用到的 Mock 数据", () => {
    const page: CanvasPage = {
      nodes: [
        {
          children: [
            {
              children: [],
              component: "src/components/button/Button.tsx#Button",
              id: "b",
              props: { children: "保存" },
            },
            {
              children: [],
              component: "src/other/Button.tsx#Button",
              id: "b2",
              props: {},
            },
          ],
          component: "src/components/card/Card.tsx#Card",
          id: "c",
          props: { children: "这段文字不用", title: "设置" },
        },
        { children: [], component: "src/components/badge/Badge.tsx#default", id: "d", props: {} },
        {
          children: [],
          component: "src/components/user-table/UserTable.tsx#UserTable",
          id: "u",
          props: { users: { mock: "users" } },
        },
      ],
      version: 1,
    };
    expect(toPageCode("Home", page, manifest, { users: "[1]" })).toBe(`import "../tokens.css";

import { Card } from "../components/card/Card";
import { Button } from "../components/button/Button";
import { Button as Button2 } from "../other/Button";
import Badge from "../components/badge/Badge";
import { UserTable } from "../components/user-table/UserTable";

const users = [1];

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: 24 }}>
      <Card title="设置">
        <Button>保存</Button>
        <Button2 />
      </Card>
      <Badge />
      <UserTable users={users} />
    </div>
  );
}
`);
  });

  it("空的页面；找不到的组件写成注释", () => {
    expect(toPageCode("Empty", { nodes: [], version: 1 }, { ...manifest, tokens: [] })).toContain(
      "<div style={{"
    );
    const code = toPageCode(
      "Home",
      { nodes: [{ children: [], component: "src/x.tsx#X", id: "x", props: {} }], version: 1 },
      manifest
    );
    expect(code).toContain("{/* src/x.tsx#X */}");
  });
});

describe("页面的文件", () => {
  it("相对路径、从文件名读出页面的名字", () => {
    expect(relativeImport("src/pages/Home.tsx", "src/components/a/A.tsx")).toBe(
      "../components/a/A"
    );
    expect(relativeImport("src/pages/Home.tsx", "src/pages/B.tsx")).toBe("./B");
    expect(pageNameOf("src/pages/Home.canvas.json")).toBe("Home");
    expect(pageNameOf("src/pages/home.canvas.json")).toBeUndefined();
    expect(pageNameOf("src/pages/Home.tsx")).toBeUndefined();
  });
});
