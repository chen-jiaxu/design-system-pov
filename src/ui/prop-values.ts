import type { RenderRequest, VariantGroup, Wrapper } from "../preview/protocol";
import type { ComponentInfo, PropInfo } from "../shared/manifest";

/**
 * 属性面板里填的 props 的值。没有的键表示不传（交给组件自己的默认值）。
 * 对象、数组的 props（data）存的是 JSON 文本，或者 { mock: 名字 }：用大纲里定义的 Mock 数据
 */
export type PropValues = Record<string, string | number | boolean | { mock: string }>;

/** 示例数据写成 JSON 文本 */
export const sampleText = (sample: unknown) => JSON.stringify(sample, null, 2);

/** 把源码里写的默认值（`"solid"`、`false`、`8`）换成值；复杂的写法读不出时返回 undefined */
export const parseDefault = (text: string | undefined): string | number | boolean | undefined => {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  const quoted = /^(["'`])(.*)\1$/s.exec(trimmed);
  if (quoted) return quoted[2];
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return undefined;
};

/** @example 写的示例值换成这个 prop 能用的值。用不了（类型对不上、JSON 不对）时返回 undefined */
export const exampleValue = (prop: PropInfo): string | number | boolean | undefined => {
  const text = prop.example;
  if (text === undefined) return undefined;
  const parsed = parseDefault(text);
  switch (prop.control.kind) {
    case "select": {
      const value = typeof parsed === "string" ? parsed : text;
      return prop.control.options.includes(value) ? value : undefined;
    }
    case "toggle":
      return typeof parsed === "boolean" ? parsed : undefined;
    case "number":
      return typeof parsed === "number" ? parsed : undefined;
    case "text":
    case "slot":
      return typeof parsed === "string" ? parsed : text;
    case "data":
      try {
        return sampleText(JSON.parse(text));
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
};

/**
 * 一个 prop 的初始值。组件写了 @example 时用它；
 * 否则必填的给一个能看出是哪个 prop 的值，免得组件因为缺值而显示不出来
 */
const initialValue = (prop: PropInfo, component: ComponentInfo) => {
  const example = exampleValue(prop);
  if (example !== undefined) return example;
  const fallback = parseDefault(prop.defaultValue);
  switch (prop.control.kind) {
    case "select": {
      if (typeof fallback === "string" && prop.control.options.includes(fallback)) return fallback;
      return prop.required ? prop.control.options[0] : undefined;
    }
    case "toggle":
      return typeof fallback === "boolean" ? fallback : prop.required ? false : undefined;
    case "number":
      return typeof fallback === "number" ? fallback : prop.required ? 0 : undefined;
    case "text":
      if (typeof fallback === "string") return fallback;
      // 链接的地址给 "/"，填 prop 名会变成相对地址
      return prop.required ? (prop.name === "href" ? "/" : prop.name) : undefined;
    case "data":
      // 必填的填上按类型生成的示例数据，组件不用自己准备数据就能显示
      return prop.required ? sampleText(prop.control.sample) : undefined;
    case "slot":
      // children 填组件名，按钮之类的能直接看到文字
      return prop.name === "children" ? component.name : prop.required ? prop.name : undefined;
    default:
      return undefined;
  }
};

export const initialProps = (component: ComponentInfo): PropValues => {
  const values: PropValues = {};
  for (const prop of component.props) {
    const value = initialValue(prop, component);
    if (value !== undefined) values[prop.name] = value;
  }
  return values;
};

/**
 * 把面板里的值换成真正传给组件的 props。只带上组件现在还有的 props（文件改了以后可能少了）。
 * data 的 JSON 文本解析成值；选了 Mock 数据的用它现在的内容，已经删掉的当作不传
 */
export const toProps = (
  component: ComponentInfo,
  values: PropValues,
  mocks: Record<string, string> = {}
): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  for (const prop of component.props) {
    const value = values[prop.name];
    if (prop.control.kind === "function" || value === undefined) continue;
    if (prop.control.kind !== "data") {
      if (typeof value !== "object") props[prop.name] = value;
      continue;
    }
    const text = typeof value === "object" ? mocks[value.mock] : String(value);
    if (text === undefined) continue;
    try {
      props[prop.name] = JSON.parse(text);
    } catch {
      // 不是合法的 JSON：不传
    }
  }
  return props;
};

/** 一个 prop 能取的值（变体一览用）：选项、开关。太多的不列 */
const MAX_VARIANTS = 12;
const variantValues = (prop: PropInfo): (string | boolean)[] | undefined => {
  if (prop.control.kind === "select" && prop.control.options.length <= MAX_VARIANTS)
    return prop.control.options;
  if (prop.control.kind === "toggle") return [false, true];
  return undefined;
};

/**
 * 变体一览：能列举的 prop（选项、开关）每个一行，这一行里只换这个 prop 的值，
 * 别的 prop 用属性面板里现在的值
 */
export const toVariants = (
  component: ComponentInfo,
  values: PropValues,
  mocks: Record<string, string> = {}
): VariantGroup[] =>
  component.props.flatMap((prop) => {
    const options = variantValues(prop);
    if (!options) return [];
    return [
      {
        items: options.map((option) => ({
          label: String(option),
          props: toProps(component, { ...values, [prop.name]: option }, mocks),
        })),
        label: prop.name,
      },
    ];
  });

/** 发给预览的渲染请求 */
export const toRenderRequest = (
  component: ComponentInfo,
  values: PropValues,
  mocks: Record<string, string> = {},
  wrappers: Wrapper[] = []
): RenderRequest => {
  const props = toProps(component, values, mocks);
  return {
    exportName: component.exportName,
    file: component.file,
    functions: component.props.filter((p) => p.control.kind === "function").map((p) => p.name),
    props,
    type: "dsp:render",
    ...(wrappers.length > 0 ? { wrappers } : {}),
  };
};
