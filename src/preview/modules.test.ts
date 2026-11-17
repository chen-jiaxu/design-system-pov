// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { createModuleSystem, type PreviewModule } from "./modules";

const script = (code: string, deps: Record<string, string> = {}): PreviewModule => ({
  code,
  deps,
  kind: "script",
});

const system = (modules: Record<string, PreviewModule>) =>
  createModuleSystem({
    externals: { react: { version: "x" } },
    modules,
    unknownModule: (specifier, from) => `找不到 ${specifier}（${from}）`,
  });

afterEach(() => {
  document.head.innerHTML = "";
});

describe("createModuleSystem", () => {
  it("按 deps 加载工作区里的文件，react 用预览页带的；同一个文件只执行一次", () => {
    const modules = {
      "src/a.ts": script(
        'const b = require("./b"); const react = require("react"); exports.value = b.count + react.version;',
        { "./b": "src/b.ts" }
      ),
      "src/b.ts": script("globalThis.runs = (globalThis.runs ?? 0) + 1; exports.count = 1;"),
    };
    const { require } = system(modules);
    expect(require("src/a.ts").value).toBe("1x");
    require("src/b.ts");
    expect((globalThis as { runs?: number }).runs).toBe(1);
  });

  it("样式被 require 时放进页面，dispose 时去掉", () => {
    const { require, dispose } = system({
      "src/a.css": { code: ".a { color: red; }", kind: "style" },
      "src/a.ts": script('require("./a.css");', { "./a.css": "src/a.css" }),
    });
    require("src/a.ts");
    expect(document.head.querySelector("style")?.textContent).toBe(".a { color: red; }");
    dispose();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("找不到的包、还不支持的文件报错，说明原因", () => {
    const { require } = system({
      "src/a.ts": script('require("clsx");'),
      "src/b.scss": { kind: "unsupported", reason: "SCSS 还不能用" },
    });
    expect(() => require("src/a.ts")).toThrow("找不到 clsx（src/a.ts）");
    expect(() => require("src/b.scss")).toThrow("SCSS 还不能用");
  });
});
