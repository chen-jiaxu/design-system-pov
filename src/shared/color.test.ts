import { describe, expect, it } from "vitest";

import { contrastOnWhite, deltaE, formatOklch, normalizeHex, textUse, toOklch } from "./color";

describe("color", () => {
  it("OKLCH：和文档里的值一致（企业色 #1957A0 是 0.46 / 0.133 / 255）", () => {
    expect(formatOklch(toOklch("#1957A0") ?? { c: 0, h: 0, l: 0 })).toBe("0.46 / 0.133 / 255");
    expect(formatOklch(toOklch("#FFFFFF") ?? { c: 0, h: 0, l: 0 })).toBe("1.00 / 0.000 / 0");
    expect(toOklch("red")).toBeUndefined();
  });

  it("ΔE：同一个颜色是 0，相近的颜色很小", () => {
    expect(deltaE("#175AA7", "#175AA7")).toBe(0);
    expect(deltaE("#175AA7", "#1957A0")?.toFixed(3)).toBe("0.013");
  });

  it("对比度和能不能用作文字", () => {
    expect(contrastOnWhite("#175AA7")?.toFixed(2)).toBe("6.87");
    expect(textUse(6.87)).toBe("ok");
    expect(textUse(3.76)).toBe("large");
    expect(textUse(2.15)).toBe("no");
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("nope")).toBeUndefined();
  });
});
