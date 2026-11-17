// 画布上的组件写成页面的代码（src/pages/名字.tsx），导出后能直接放进项目里用。
import type { ComponentInfo, Manifest } from "../shared/manifest";
import type { CanvasNode, CanvasPage } from "./canvas-tree";
import { jsxParts, jsxText, MAX_LINE, openTag, width } from "./jsx";
import type { Mocks } from "./mocks";
import { componentId } from "./selection";

/** 页面放在哪个目录 */
export const PAGES_DIR = "src/pages";

/** 一个页面的两个文件：画布的结构、生成的代码 */
export const pageFiles = (name: string) => ({
  canvas: `${PAGES_DIR}/${name}.canvas.json`,
  code: `${PAGES_DIR}/${name}.tsx`,
});

/** canvas.json 的路径 → 页面的名字。不是页面时返回 undefined */
export const pageNameOf = (file: string): string | undefined =>
  new RegExp(`^${PAGES_DIR}/([A-Z][A-Za-z0-9]*)\\.canvas\\.json$`).exec(file)?.[1];

/** 根上的组件怎么排：从上往下，左对齐，有间距 */
export const PAGE_STYLE =
  '{{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: 24 }}';

/** 从 from 所在的目录看 to 的相对路径（import 用，去掉 .tsx / .ts） */
export const relativeImport = (from: string, to: string): string => {
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.replace(/\.(tsx?|jsx?)$/, "").split("/");
  let same = 0;
  while (same < fromParts.length && fromParts[same] === toParts[same]) same++;
  const up = fromParts.length - same;
  const rest = toParts.slice(same).join("/");
  return up === 0 ? `./${rest}` : `${"../".repeat(up)}${rest}`;
};

/** 用到的 Mock 数据的名字 */
const usedMocks = (nodes: CanvasNode[], found = new Set<string>()): Set<string> => {
  for (const node of nodes) {
    for (const value of Object.values(node.props)) {
      if (typeof value === "object") found.add(value.mock);
    }
    usedMocks(node.children, found);
  }
  return found;
};

export const toPageCode = (
  name: string,
  page: CanvasPage,
  manifest: Manifest,
  mocks: Mocks = {}
): string => {
  const file = pageFiles(name).code;
  const byId = new Map(manifest.components.map((c) => [componentId(c), c]));

  // 每个用到的组件在页面里叫什么。名字重了（不同文件里的同名组件）时后面加数字
  const locals = new Map<string, string>();
  const taken = new Set([name]);
  const localOf = (component: ComponentInfo) => {
    const id = componentId(component);
    const known = locals.get(id);
    if (known) return known;
    let local = component.name;
    for (let n = 2; taken.has(local); n++) local = `${component.name}${n}`;
    taken.add(local);
    locals.set(id, local);
    return local;
  };

  const render = (node: CanvasNode, indent: string): string => {
    const component = byId.get(node.component);
    if (!component) return `${indent}{/* ${node.component} */}`;
    const local = localOf(component);
    const { attributes, children } = jsxParts(component, node.props);
    const open = openTag(local, attributes, indent);
    const multiLine = open.includes("\n");
    const close = `</${local}>`;
    if (node.children.length > 0) {
      const inner = node.children.map((child) => render(child, `${indent}  `)).join("\n");
      return `${indent}${open}>\n${inner}\n${indent}${close}`;
    }
    if (children === undefined || children === "")
      return `${indent}${open}${multiLine ? "/>" : " />"}`;
    const oneLine = `${indent}${open}>${jsxText(children)}${close}`;
    if (!multiLine && width(oneLine) <= MAX_LINE) return oneLine;
    return `${indent}${open}>\n${indent}  ${jsxText(children)}\n${indent}${close}`;
  };

  const body =
    page.nodes.length === 0
      ? `    <div style=${PAGE_STYLE} />`
      : [
          `    <div style=${PAGE_STYLE}>`,
          ...page.nodes.map((node) => render(node, "      ")),
          "    </div>",
        ].join("\n");

  const imports = [...locals.entries()].map(([id, local]) => {
    const component = byId.get(id) as ComponentInfo;
    const from = JSON.stringify(relativeImport(file, component.file));
    if (component.exportName === "default") return `import ${local} from ${from};`;
    return component.exportName === local
      ? `import { ${local} } from ${from};`
      : `import { ${component.exportName} as ${local} } from ${from};`;
  });
  // 定义 token 的样式，页面单独打开时也要有
  const styles = [...new Set(manifest.tokens.map((t) => t.file))].map(
    (css) => `import ${JSON.stringify(relativeImport(file, css))};`
  );
  const data = [...usedMocks(page.nodes)]
    .filter((mock) => mock in mocks)
    .map((mock) => `const ${mock} = ${mocks[mock]};`);

  return [
    ...(styles.length > 0 ? [...styles, ""] : []),
    ...(imports.length > 0 ? [...imports, ""] : []),
    ...(data.length > 0 ? [...data, ""] : []),
    `export default function ${name}() {`,
    "  return (",
    body,
    "  );",
    "}",
    "",
  ].join("\n");
};
