import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createAnalyzer } from "./analyze.js";
import { createFiles } from "./files.js";
import { loadTypeLibs, readDirectory } from "./type-libs.node.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const { analyze } = createAnalyzer(
  (await import("typescript")).default,
  loadTypeLibs(path.resolve(here, "../../node_modules"))
);

// 测试对象：新工作区的初始内容（templates/starter）
const starter = readDirectory(path.resolve(here, "../../templates/starter"));

// 类型分析要加载 React 和 DOM 的类型定义，比普通测试慢
const TIMEOUT = 30_000;

describe("analyze：templates/starter", () => {
  const manifest = () => analyze({ files: createFiles(starter) });

  it(
    "找出三种写法的组件，hook 和常量不算组件",
    () => {
      const components = manifest().components;
      expect(components.map((c) => [c.name, c.exportName])).toEqual([
        ["Alert", "Alert"],
        ["Badge", "default"],
        ["Button", "Button"],
        ["Card", "Card"],
        ["PageHeader", "PageHeader"],
        ["Stack", "Stack"],
        ["Stat", "Stat"],
        ["Tag", "Tag"],
        ["TextField", "TextField"],
        ["UserTable", "UserTable"],
      ]);
    },
    TIMEOUT
  );

  it(
    "箭头函数：读出自有 props 的可选值、默认值、JSDoc，继承的 HTML 属性只计数（children、disabled 除外）",
    () => {
      const button = manifest().components.find((c) => c.name === "Button");
      expect(button?.props.find((p) => p.name === "variant")).toMatchObject({
        control: { kind: "select", options: ["solid", "outline"] },
        defaultValue: '"solid"',
        description: "見た目",
        required: false,
      });
      expect(button?.props.some((p) => p.name === "ref")).toBe(false);
      expect(button?.styles).toEqual(["src/components/button/button.css"]);
      expect(button?.props.find((p) => p.name === "children")?.control).toEqual({ kind: "slot" });
      expect(button?.props.find((p) => p.name === "disabled")?.control).toEqual({ kind: "toggle" });
      expect(button?.inheritedPropCount).toBeGreaterThan(100);
    },
    TIMEOUT
  );

  it(
    "对象、数组的 props：按类型生成示例数据",
    () => {
      const table = manifest().components.find((c) => c.name === "UserTable");
      expect(table?.props.find((p) => p.name === "users")?.control).toEqual({
        kind: "data",
        sample: [
          { active: false, id: 1, name: "name 1", role: "admin" },
          { active: false, id: 2, name: "name 2", role: "admin" },
        ],
        type: "User[]",
      });
    },
    TIMEOUT
  );

  it(
    "function 声明：读出各种控件类型和默认值",
    () => {
      const card = manifest().components.find((c) => c.name === "Card");
      expect(card?.props.map((p) => [p.name, p.control.kind])).toEqual([
        ["title", "text"],
        ["children", "slot"],
        ["elevated", "toggle"],
        ["onClose", "function"],
      ]);
      expect(card?.props.find((p) => p.name === "elevated")?.defaultValue).toBe("false");
      expect(card?.props.find((p) => p.name === "title")?.required).toBe(true);
    },
    TIMEOUT
  );

  it(
    "default export：props 类型写在参数上也能读出",
    () => {
      const badge = manifest().components.find((c) => c.name === "Badge");
      expect(badge?.props.find((p) => p.name === "tone")).toMatchObject({
        control: { kind: "select", options: ["success", "warning"] },
        defaultValue: '"success"',
      });
      expect(badge?.props.find((p) => p.name === "count")?.control).toEqual({ kind: "number" });
    },
    TIMEOUT
  );

  it(
    "token：读出组件 CSS 里用到的 CSS 变量，组件自己定义的内部变量不算",
    () => {
      const components = manifest().components;
      const button = components.find((c) => c.name === "Button");
      expect(button?.tokens).toContain("--app-color-primary");
      expect(button?.tokens).not.toContain("--_bg");
      expect(components.find((c) => c.name === "Badge")?.tokens).toEqual([
        "--app-font-family",
        "--app-color-success",
        "--app-color-warning",
      ]);
    },
    TIMEOUT
  );

  it(
    "token 的定义：读出 :root 里的 CSS 变量",
    () => {
      const tokens = manifest().tokens;
      expect(tokens).toHaveLength(15);
      expect(tokens[0]).toEqual({
        file: "src/tokens.css",
        name: "--app-color-primary",
        source: "root",
        value: "#0f766e",
      });
    },
    TIMEOUT
  );

  it(
    "JSDoc 的 @example：作为示例值读出，说明文里不带它",
    () => {
      const field = manifest().components.find((c) => c.name === "TextField");
      expect(field?.props.find((p) => p.name === "label")).toMatchObject({
        description: "入力欄の名前",
        example: "メールアドレス",
      });
      expect(field?.props.find((p) => p.name === "hint")?.example).toBeUndefined();
    },
    TIMEOUT
  );

  it("组件目录里没有文件时，组件是空的", () => {
    expect(analyze({ componentsDir: "nope", files: createFiles(starter) }).components).toEqual([]);
  });
});

describe("analyze：样式的各种写法", () => {
  it(
    "SCSS、Less 写的样式也认：记下样式文件，读出里面用到的 token，样式里自己定义的变量不算",
    () => {
      const { components, tailwind } = analyze({
        files: createFiles({
          "src/components/Alert.tsx":
            'import "./alert.less";\nexport const Alert = () => <div className="alert" />;\n',
          "src/components/Tag.tsx":
            'import "./tag.scss";\nexport const Tag = () => <span className="tag" />;\n',
          "src/components/alert.less":
            "// Less 的变量\n@line: 4px;\n.alert { border-left: @line solid var(--color-warning); }\n",
          "src/components/tag.scss":
            "$h: 26px;\n.tag { --_pad: 4px; height: $h; padding: var(--_pad); color: var(--color-text); }\n",
          "src/tokens.scss": ":root {\n  --color-text: #111;\n  --color-warning: #b45309;\n}\n",
        }),
      });
      const tag = components.find((c) => c.name === "Tag");
      expect(tag?.styles).toEqual(["src/components/tag.scss"]);
      expect(tag?.tokens).toEqual(["--color-text"]);
      const alert = components.find((c) => c.name === "Alert");
      expect(alert?.styles).toEqual(["src/components/alert.less"]);
      expect(alert?.tokens).toEqual(["--color-warning"]);
      expect(tailwind).toBe(false);
    },
    TIMEOUT
  );

  it(
    "Tailwind v4：读出 @theme 里定义的 token，并从类名找出组件用到的 token",
    () => {
      const manifest = analyze({
        files: createFiles({
          "package.json": JSON.stringify({ devDependencies: { tailwindcss: "^4" } }),
          "src/app/globals.css":
            '@import "tailwindcss";\n@theme {\n  --color-primary: #7c3aed;\n  --color-primary-hover: #6d28d9;\n  --color-on-primary: #fff;\n  --color-muted: #71717a;\n  --radius-card: 12px;\n}\n',
          "src/components/Button.tsx": [
            "const VARIANTS = {",
            '  solid: "bg-primary text-on-primary hover:bg-primary-hover",',
            '  ghost: "bg-transparent text-primary/50",',
            "} as const;",
            'export function Button({ variant = "solid" }: { variant?: keyof typeof VARIANTS }) {',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: 这是组件的源码文本
            '  return <button className={`rounded-md ${VARIANTS[variant]}`} type="button" />;',
            "}",
          ].join("\n"),
          "src/components/Card.tsx":
            'export const Card = () => <section className="rounded-card bg-(--color-muted) p-4" />;\n',
          "src/components/Avatar.tsx":
            'export const Avatar = () => <img alt="" className="rounded-full" />;\n',
        }),
      });
      expect(manifest.tailwind).toBe(true);
      expect(manifest.tokens.map((t) => [t.name, t.source, t.file])).toContainEqual([
        "--color-primary",
        "theme",
        "src/app/globals.css",
      ]);
      expect(manifest.tokens).toHaveLength(5);

      const tokensOf = (name: string) =>
        manifest.components.find((c) => c.name === name)?.tokens.sort();
      expect(tokensOf("Button")).toEqual([
        "--color-on-primary",
        "--color-primary",
        "--color-primary-hover",
      ]);
      expect(tokensOf("Card")).toEqual(["--color-muted", "--radius-card"]);
      expect(tokensOf("Avatar")).toEqual([]);
    },
    TIMEOUT
  );
});

describe("analyze：Provider 和异步组件", () => {
  it(
    "Provider 不算组件，另外列出来；异步的 Server Component 标为暂时无法显示",
    () => {
      const { components, providers } = analyze({
        files: createFiles({
          "src/components/CartProvider.tsx": [
            'import { createContext, type ReactNode } from "react";',
            "const Cart = createContext<number[]>([]);",
            "export function CartProvider({ items = [], children }: { items?: number[]; children: ReactNode }) {",
            "  return <Cart.Provider value={items}>{children}</Cart.Provider>;",
            "}",
          ].join("\n"),
          "src/components/UserList.tsx": [
            "export async function UserList({ limit = 3 }: { limit?: number }) {",
            "  const users = await Promise.resolve(['a', 'b'].slice(0, limit));",
            "  return <ul>{users.map((u) => <li key={u}>{u}</li>)}</ul>;",
            "}",
          ].join("\n"),
          "src/components/Title.tsx": "export const Title = () => <h1>title</h1>;\n",
        }),
      });
      expect(components.map((c) => c.name)).toEqual(["Title", "UserList"]);
      expect(providers.map((p) => [p.name, p.file, p.props.map((prop) => prop.name)])).toEqual([
        ["CartProvider", "src/components/CartProvider.tsx", ["items"]],
      ]);
      expect(components.find((c) => c.name === "UserList")?.unavailable?.reason).toContain(
        "Server Component"
      );
      expect(components.filter((c) => c.unavailable).map((c) => c.name)).toEqual(["UserList"]);
    },
    TIMEOUT
  );
});

describe("analyze：草稿（界面里改过、新建的内容）", () => {
  const file = (name: string) => `src/components/${name}`;

  it(
    "原本没有的文件当作新建的组件，标成草稿；原本有的文件用草稿的内容分析",
    () => {
      const drafts = Object.fromEntries([
        [
          file("Hello.tsx"),
          'import "./hello.css";\nexport function Hello({ name = "x", big }: { name?: string; big: boolean }) {\n  return <p className="hello" data-big={big}>{name}</p>;\n}\n',
        ],
        [file("hello.css"), ".hello { color: var(--app-color-primary); }\n"],
        [
          file("badge/Badge.tsx"),
          "export default function Badge({ text }: { text: string }) {\n  return <span>{text}</span>;\n}\n",
        ],
      ]);
      const { components } = analyze({ files: createFiles(starter, drafts) });

      const hello = components.find((c) => c.name === "Hello");
      expect(hello).toMatchObject({
        draft: true,
        file: "src/components/Hello.tsx",
        styles: ["src/components/hello.css"],
        tokens: ["--app-color-primary"],
      });
      expect(hello?.props.map((p) => [p.name, p.control.kind, p.required])).toEqual([
        ["name", "text", false],
        ["big", "toggle", true],
      ]);

      const badge = components.find((c) => c.name === "Badge");
      expect(badge?.draft).toBeUndefined();
      expect(badge?.props.map((p) => p.name)).toEqual(["text"]);
      expect(badge?.styles).toEqual([]);
    },
    TIMEOUT
  );
});
