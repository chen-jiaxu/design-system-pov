import { describe, expect, it } from "vitest";

import { indentOf } from "./indent";

describe("indentOf", () => {
  it("文件用 tab 缩进时是 tab，否则是两个空格", () => {
    expect(indentOf("a {\n\tcolor: red;\n}\n")).toBe("\t");
    expect(indentOf("a {\n  color: red;\n}\n")).toBe("  ");
    expect(indentOf("")).toBe("  ");
  });
});
