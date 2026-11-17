import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { createFiles } from "../analyzer/files";
import { loadTypeLibs } from "../analyzer/type-libs.node";
import { createSystem, readCompilerOptions } from "../analyzer/typescript";
import { checkSyntax, createCompiler } from "./compile";
import { compileMessagesFor } from "./messages";

const libs = loadTypeLibs(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../node_modules")
);
const messages = compileMessagesFor("zh");

const compile = (files: Record<string, string>) => {
  const workspace = createFiles(files);
  const system = createSystem(workspace, libs);
  return createCompiler(ts)(workspace, system, readCompilerOptions(ts, system), messages);
};

describe("createCompiler", () => {
  it("TSX 编译成 CommonJS；相对路径、tsconfig 的别名、样式文件都找到工作区里的文件", () => {
    const modules = compile({
      "src/a.css": ".a {}",
      "src/components/Hello.tsx": [
        'import { useState } from "react";',
        'import { label } from "@/label";',
        'import "../a.css";',
        'import { size } from "./size";',
        "export const Hello = () => <p>{label}{size}{String(useState)}</p>;",
      ].join("\n"),
      "src/components/size.ts": "export const size = 1;",
      "src/label.ts": 'export const label = "hi";',
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    });
    const hello = modules["src/components/Hello.tsx"];
    expect(hello?.kind).toBe("script");
    if (hello?.kind !== "script") return;
    expect(hello.code).toContain('require("react/jsx-runtime")');
    expect(hello.deps).toEqual({
      "../a.css": "src/a.css",
      "./size": "src/components/size.ts",
      "@/label": "src/label.ts",
    });
    expect(modules["src/a.css"]).toEqual({ code: ".a {}", kind: "style" });
  });

  it("SCSS、Less 标成还不支持", () => {
    expect(compile({ "src/a.scss": "$x: 1px;" })["src/a.scss"]).toEqual({
      kind: "unsupported",
      reason: "src/a.scss：SCSS、Sass、Less 还不能在预览里用，请改用 CSS",
    });
  });
});

describe("checkSyntax", () => {
  it("语法有错时写明第几行，没错时是 undefined", () => {
    expect(checkSyntax(ts, "src/A.tsx", "export const A = () => <p>ok</p>;", messages)).toBe(
      undefined
    );
    expect(checkSyntax(ts, "src/A.tsx", "export const A = () => (\n  <p>ok</p\n);", messages)).toBe(
      "src/A.tsx 第 3 行：'>' expected."
    );
    expect(checkSyntax(ts, "src/a.css", "{{{", messages)).toBe(undefined);
  });
});
