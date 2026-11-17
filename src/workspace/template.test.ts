import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createAnalyzer } from "../analyzer/analyze.js";
import { createFiles } from "../analyzer/files.js";
import { loadTypeLibs, readDirectory } from "../analyzer/type-libs.node.js";
import { allNodes, parsePage, serializePage } from "../ui/canvas-tree.js";
import { pageFiles, pageNameOf, toPageCode } from "../ui/page-code.js";
import { componentId } from "../ui/selection.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../templates/starter");
const { analyze } = createAnalyzer(
  (await import("typescript")).default,
  loadTypeLibs(path.resolve(here, "../../node_modules"))
);
const starter = readDirectory(root);

const TIMEOUT = 30_000;

// 示例页面的代码（src/pages/名字.tsx）由画布的结构生成。改了结构或组件以后用
// UPDATE_TEMPLATE=1 npx vitest run src/workspace/template.test.ts 重新生成
describe("模板里的示例页面", () => {
  const manifest = analyze({ files: createFiles(starter) });
  const pages = Object.keys(starter)
    .map(pageNameOf)
    .filter((name): name is string => name !== undefined);

  it("有列表、表单、仪表盘三张", () => {
    expect(pages.sort()).toEqual(["AccountSettings", "Dashboard", "UserList"]);
  });

  it.each(pages)(
    "%s：结构能读，用到的组件都在模板里，props 都是组件有的",
    (name) => {
      const text = starter[pageFiles(name).canvas] as string;
      const page = parsePage(text);
      expect(page).toBeDefined();
      if (!page) return;
      // 存的格式和界面写出来的一样（打开页面时不会变成改动）
      expect(serializePage(page)).toBe(text);
      const components = new Map(manifest.components.map((c) => [componentId(c), c]));
      for (const node of allNodes(page.nodes)) {
        const component = components.get(node.component);
        expect(component, node.component).toBeDefined();
        const names = component?.props.map((p) => p.name) ?? [];
        for (const prop of Object.keys(node.props)) expect(names, node.id).toContain(prop);
      }
    },
    TIMEOUT
  );

  it.each(pages)(
    "%s：页面的代码和结构生成的一样",
    (name) => {
      const files = pageFiles(name);
      const page = parsePage(starter[files.canvas] as string);
      if (!page) throw new Error(`${files.canvas} を読めません`);
      const code = toPageCode(name, page, manifest);
      if (process.env.UPDATE_TEMPLATE) writeFileSync(path.join(root, files.code), code);
      else expect(starter[files.code]).toBe(code);
    },
    TIMEOUT
  );
});
