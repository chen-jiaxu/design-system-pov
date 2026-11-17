export const parseHex = (value: string): [number, number, number] | null => {
  const hex = value.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
};

const luminance = ([r, g, b]: [number, number, number]) => {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.039_28 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG 对比度。非 16 进制的颜色无法计算，返回 null。 */
export const contrastRatio = (fg: string, bg: string): number | null => {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!(a && b)) {
    return null;
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export const isHexColor = (value: string) => parseHex(value) !== null;
