import { describe, expect, it } from "vitest";
import { contrastRatio, isHexColor } from "./contrast";

describe("contrastRatio", () => {
  it("白与黑为 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("文字和背景互换，结果相同", () => {
    expect(contrastRatio("#2b59c3", "#ffffff")).toBe(contrastRatio("#ffffff", "#2b59c3"));
  });

  it("能读取 3 位 16 进制", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
  });

  it("非 16 进制返回 null", () => {
    expect(contrastRatio("red", "#000000")).toBeNull();
    expect(isHexColor("rgb(0 0 0)")).toBe(false);
  });
});
