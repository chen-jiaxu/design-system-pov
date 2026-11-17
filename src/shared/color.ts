// 颜色的计算：OKLCH（明度、彩度、色相）、OKLab 中的距离（ΔE）、WCAG 对比度能不能用作文字。
import { contrastRatio, parseHex } from "./contrast";

export interface Oklch {
  /** 明度 0〜1 */
  l: number;
  /** 彩度 */
  c: number;
  /** 色相（度）。灰色时没有意义，是 0 */
  h: number;
}

const linear = (channel: number) => {
  const s = channel / 255;
  return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** sRGB → OKLab（Björn Ottosson 的式子）。不是 #RRGGBB 时返回 undefined */
export const toOklab = (hex: string): [number, number, number] | undefined => {
  const rgb = parseHex(hex);
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  return [
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  ];
};

export const toOklch = (hex: string): Oklch | undefined => {
  const lab = toOklab(hex);
  if (!lab) return undefined;
  const [l, a, b] = lab;
  const c = Math.hypot(a, b);
  const h = c < 0.000_1 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { c, h, l };
};

/** 写成 "0.46 / 0.133 / 255" */
export const formatOklch = (value: Oklch) =>
  `${value.l.toFixed(2)} / ${value.c.toFixed(3)} / ${Math.round(value.h)}`;

/** 两个颜色在 OKLab 中的距离。0.02 左右能看出差别 */
export const deltaE = (a: string, b: string): number | undefined => {
  const x = toOklab(a);
  const y = toOklab(b);
  if (!(x && y)) return undefined;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** 能不能用作文字：正文要 4.5:1，大字（18pt 以上等）要 3:1 */
export type TextUse = "ok" | "large" | "no";

export const textUse = (ratio: number): TextUse =>
  ratio >= 4.5 ? "ok" : ratio >= 3 ? "large" : "no";

/** 和白底的对比度 */
export const contrastOnWhite = (hex: string) => contrastRatio(hex, "#ffffff");

/** 统一写成大写的 #RRGGBB。不是颜色时返回 undefined */
export const normalizeHex = (value: string): string | undefined => {
  const rgb = parseHex(value);
  return rgb
    ? `#${rgb
        .map((c) => c.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`
    : undefined;
};
