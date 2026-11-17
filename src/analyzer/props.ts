import type * as TS from "typescript";

import type { PropControl, PropInfo } from "../shared/manifest.js";
import { NO_SAMPLE, sampleOf } from "./sample.js";
import type { TypeScript } from "./typescript.js";

/** React 自己处理的 props，不显示在面板上。 */
const IGNORED_PROPS = new Set(["key", "ref"]);

/**
 * 继承来的 props 里，预览时需要能填的（按钮的文字）、要能看到的状态（不能用）。
 * 和自有 props 一样列出
 */
const SHOWN_INHERITED_PROPS = new Set(["children", "disabled"]);

const isFromNodeModules = (symbol: TS.Symbol) =>
  (symbol.declarations ?? []).every((d) => d.getSourceFile().fileName.includes("/node_modules/"));

export const describeType = (
  ts: TypeScript,
  checker: TS.TypeChecker,
  type: TS.Type,
  location: TS.Node,
  name: string
): PropControl => {
  const text = checker.typeToString(type);
  if (/ReactNode|ReactElement|JSX\.Element/.test(text)) {
    return { kind: "slot" };
  }
  const parts = type.isUnion()
    ? type.types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)))
    : [type];
  if (parts.length > 0 && parts.every((t) => t.isStringLiteral())) {
    return { kind: "select", options: parts.map((t) => (t as TS.StringLiteralType).value) };
  }
  if (parts.every((t) => t.flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Boolean))) {
    return { kind: "toggle" };
  }
  if (parts.length === 1) {
    const only = parts[0] as TS.Type;
    if (only.flags & ts.TypeFlags.String) return { kind: "text" };
    if (only.flags & ts.TypeFlags.Number) return { kind: "number" };
    if (only.getCallSignatures().length > 0) return { kind: "function" };
  }
  // 对象、数组等：能按类型生成示例数据的，在界面上用 JSON 编辑
  const sample = sampleOf(ts, checker, type, location, name);
  if (sample !== NO_SAMPLE) return { kind: "data", sample, type: text };
  return { kind: "unknown", type: text };
};

/** 找到组件函数本体。支持 function 声明、箭头函数、函数表达式，以及 memo/forwardRef 包一层的写法。 */
export const findFunctionNode = (
  ts: TypeScript,
  declaration: TS.Declaration | undefined
): TS.SignatureDeclaration | undefined => {
  if (!declaration) return undefined;
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  const unwrap = (node: TS.Expression | undefined): TS.SignatureDeclaration | undefined => {
    if (!node) return undefined;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
    if (ts.isCallExpression(node)) return unwrap(node.arguments[0]);
    if (ts.isParenthesizedExpression(node)) return unwrap(node.expression);
    return undefined;
  };
  if (ts.isVariableDeclaration(declaration)) return unwrap(declaration.initializer);
  if (ts.isExportAssignment(declaration)) return unwrap(declaration.expression);
  return undefined;
};

/** 从第一个参数的解构里读出默认值。 */
export const readDefaults = (
  ts: TypeScript,
  fn: TS.SignatureDeclaration | undefined
): Map<string, string> => {
  const defaults = new Map<string, string>();
  const param = fn?.parameters[0];
  if (!param || !ts.isObjectBindingPattern(param.name)) {
    return defaults;
  }
  for (const element of param.name.elements) {
    if (!element.initializer) continue;
    const key = (element.propertyName ?? element.name).getText();
    defaults.set(key, element.initializer.getText());
  }
  return defaults;
};

export const readProps = (
  ts: TypeScript,
  checker: TS.TypeChecker,
  propsType: TS.Type | undefined,
  location: TS.Node,
  defaults: Map<string, string>
): { props: PropInfo[]; inheritedPropCount: number } => {
  if (!propsType) {
    return { inheritedPropCount: 0, props: [] };
  }
  const all = propsType.getProperties().filter((p) => !IGNORED_PROPS.has(p.name));
  const own = all.filter((p) => SHOWN_INHERITED_PROPS.has(p.name) || !isFromNodeModules(p));
  const props = own.map((symbol): PropInfo => {
    const type = checker.getTypeOfSymbolAtLocation(symbol, location);
    const description = ts.displayPartsToString(symbol.getDocumentationComment(checker));
    const defaultValue = defaults.get(symbol.name);
    // @example 写的示例值：预览、画布上放进去时先用它
    const exampleTag = symbol.getJsDocTags(checker).find((tag) => tag.name === "example");
    const example = exampleTag ? ts.displayPartsToString(exampleTag.text).trim() : "";
    return {
      control: describeType(ts, checker, type, location, symbol.name),
      name: symbol.name,
      required: (symbol.flags & ts.SymbolFlags.Optional) === 0,
      ...(description ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(example ? { example } : {}),
    };
  });
  return { inheritedPropCount: all.length - own.length, props };
};
