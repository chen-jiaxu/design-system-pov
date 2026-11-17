import type { ComponentInfo } from "../shared/manifest";
import { type PropValues, parseDefault } from "./prop-values";

/** 一行写得下就写成一行，超过这个长度时每个 prop 一行 */
export const MAX_LINE = 72;

/** 显示宽度。中文等全角字符算 2 */
export const width = (line: string) =>
  [...line].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1), 0);

/** 一个 prop 写成 JSX 属性。字符串里有双引号或换行时用 {"..."} */
const attribute = (name: string, value: string | number | boolean): string => {
  if (value === true) return name;
  if (typeof value === "string") {
    return /["\n{}]/.test(value) ? `${name}={${JSON.stringify(value)}}` : `${name}="${value}"`;
  }
  return `${name}={${String(value)}}`;
};

/** JSON 文本去掉换行和缩进，写成一行 */
const compactJson = (json: string) => {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
};

/** 写在标签中间的文字。有 JSX 的特殊字符时用 {"..."} */
const text = (value: string) => (/[{}<>]/.test(value) ? `{${JSON.stringify(value)}}` : value);

/**
 * props 写成 JSX 的属性和标签中间的文字。
 * 没填的、和组件默认值相同的 props 不写；必填的函数 prop 写成空函数。
 */
export const jsxParts = (
  component: ComponentInfo,
  values: PropValues
): { attributes: string[]; children?: string } => {
  const attributes: string[] = [];
  let children: string | undefined;
  for (const prop of component.props) {
    if (prop.control.kind === "function") {
      if (prop.required) attributes.push(`${prop.name}={() => {}}`);
      continue;
    }
    const value = values[prop.name];
    if (value === undefined || value === parseDefault(prop.defaultValue)) continue;
    // 用了 Mock 数据：写成变量名。自己写的 JSON：原样写进花括号（JSON 也是合法的 JS）
    if (typeof value === "object") {
      attributes.push(`${prop.name}={${value.mock}}`);
      continue;
    }
    if (prop.control.kind === "data") {
      attributes.push(`${prop.name}={${compactJson(String(value))}}`);
      continue;
    }
    if (prop.name === "children") {
      children = String(value);
      continue;
    }
    attributes.push(attribute(prop.name, value));
  }
  return { attributes, children };
};

/** 开始标签。一行写不下时每个属性一行；indent 是这一行前面的空格 */
export const openTag = (name: string, attributes: string[], indent = ""): string => {
  const oneLine = [name, ...attributes].join(" ");
  if (attributes.length === 0 || width(indent + oneLine) + 2 <= MAX_LINE) return `<${oneLine}`;
  return `<${name}\n${attributes.map((a) => `${indent}  ${a}`).join("\n")}\n${indent}`;
};

/** 标签中间的文字 */
export const jsxText = (value: string) => text(value);

/** 把属性面板里现在的 props 写成 JSX，可以直接复制到项目里用 */
export const toJsx = (component: ComponentInfo, values: PropValues): string => {
  const { attributes, children } = jsxParts(component, values);
  const name = component.name;
  const oneLine = [name, ...attributes].join(" ");
  const multiLine = attributes.length > 0 && width(oneLine) + 2 > MAX_LINE;
  const open = multiLine
    ? `<${name}\n${attributes.map((a) => `  ${a}`).join("\n")}\n`
    : `<${oneLine}`;

  if (children === undefined || children === "") return multiLine ? `${open}/>` : `${open} />`;
  const close = `</${name}>`;
  const inner = text(children);
  if (!multiLine && width(`${open}>${inner}${close}`) <= MAX_LINE)
    return `${open}>${inner}${close}`;
  return `${open}>\n  ${inner}\n${close}`;
};
