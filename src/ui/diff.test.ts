import { describe, expect, it } from "vitest";

import { diffLines } from "./diff";

const show = (before: string, after: string) =>
  diffLines(before, after).map(
    (row) =>
      `${row.changed ? "*" : " "} ${row.left ? `${row.left.line}:${row.left.text}` : "-"} | ${
        row.right ? `${row.right.line}:${row.right.text}` : "-"
      }`
  );

describe("diffLines", () => {
  it("没有改动时每一行左右相同", () => {
    expect(show("a\nb\n", "a\nb\n")).toEqual(["  1:a | 1:a", "  2:b | 2:b"]);
  });

  it("改了一行：左边是原来的，右边是改成的，排在同一行", () => {
    expect(show("a\nb\nc\n", "a\nB\nc\n")).toEqual(["  1:a | 1:a", "* 2:b | 2:B", "  3:c | 3:c"]);
  });

  it("加了行：左边是空的，后面的行号错开", () => {
    expect(show("a\nc\n", "a\nb1\nb2\nc\n")).toEqual([
      "  1:a | 1:a",
      "* - | 2:b1",
      "* - | 3:b2",
      "  2:c | 4:c",
    ]);
  });

  it("删了行：右边是空的", () => {
    expect(show("a\nb\nc\n", "a\nc\n")).toEqual(["  1:a | 1:a", "* 2:b | -", "  3:c | 2:c"]);
  });

  it("几处改动分开找出来", () => {
    expect(show("a\nb\nc\nd\ne\n", "A\nb\nc\nx\nd\n")).toEqual([
      "* 1:a | 1:A",
      "  2:b | 2:b",
      "  3:c | 3:c",
      "* - | 4:x",
      "  4:d | 5:d",
      "* 5:e | -",
    ]);
  });
});
