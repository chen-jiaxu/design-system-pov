import { describe, expect, it } from "vitest";

import { exportFiles, importFiles, TOKENS_FILE } from "./export";
import { setLocale } from "./i18n";

// 别的测试可能换过语言，这里固定用中文
setLocale("zh");

describe("exportFiles", () => {
  it("工作区的文件按原来的路径放，方案放进 design-tokens.json，另外带一份说明", () => {
    const files = exportFiles(
      "my-app",
      {
        "src/components/Hello.tsx": "export const Hello = () => null;\n",
        "src/tokens.css": ":root {}\n",
      },
      ["src/components/Hello.tsx"],
      { schemes: [] }
    );
    expect(Object.keys(files)).toEqual([
      "src/components/Hello.tsx",
      "src/tokens.css",
      TOKENS_FILE,
      "README.txt",
    ]);
    expect(JSON.parse(files[TOKENS_FILE] ?? "")).toEqual({ schemes: [] });
    expect(files["README.txt"]).toContain("（my-app）");
    expect(files["README.txt"]).toContain("- src/components/Hello.tsx");
    expect(files["README.txt"]).not.toContain("- src/tokens.css");
  });

  it("没有改过的文件时，说明里不列改过的文件", () => {
    const readme = exportFiles("my-app", { "a.css": "" }, [])["README.txt"];
    expect(readme).not.toContain("改过的文件");
  });
});

describe("importFiles", () => {
  it("读回导出的内容：说明、Mock 数据、__MACOSX 不要，方案单独拿出来", () => {
    const zip = {
      ...exportFiles("x", { "src/a.tsx": "a", "src/tokens.css": "b" }, [], { schemes: [1] }),
      "__MACOSX/src/._a.tsx": "junk",
      "mocks/list.json": "[]",
    };
    expect(importFiles(zip)).toEqual({
      files: { "src/a.tsx": "a", "src/tokens.css": "b" },
      tokens: { schemes: [1] },
    });
  });

  it("没有源码的 zip 不认", () => {
    expect(importFiles({ "photo.jpg": "x" })).toBeUndefined();
  });
});
