import type * as TS from "typescript";

import type { TypeScript } from "./typescript.js";

/** 生成不出示例时返回它（和 undefined、null 这些正常的值区分开） */
export const NO_SAMPLE = Symbol("no sample");

/** 嵌套超过这么多层就不再往下生成（树形的类型会一直套下去） */
const MAX_DEPTH = 5;
/** 属性不超过这么多个时，可选的属性也填上；再多的（如 CSSProperties）只填必填的 */
const MAX_OPTIONAL = 12;
/** 数组里生成几项 */
const ARRAY_LENGTH = 2;

const isArray = (type: TS.Type) =>
  type.symbol?.name === "Array" || type.symbol?.name === "ReadonlyArray";

const isTuple = (ts: TypeScript, type: TS.Type) =>
  Boolean(
    (type as TS.TypeReference).target &&
      (type as TS.TypeReference).target.objectFlags & ts.ObjectFlags.Tuple
  );

/**
 * 按类型生成一份能写成 JSON 的示例数据，让需要对象、数组的组件不用自己准备数据就能显示。
 * - 字符串用属性名（数组里的加上序号），数字用序号，布尔值用 false
 * - 联合类型用第一个能生成的；函数、Date、Promise 这些写不成 JSON 的生成不出来
 * - 对象里生成不出来的属性：可选的跳过，必填的话整个对象都生成不出来
 */
export const sampleOf = (
  ts: TypeScript,
  checker: TS.TypeChecker,
  type: TS.Type,
  location: TS.Node,
  hint: string
): unknown => {
  const visit = (current: TS.Type, name: string, depth: number, item: number): unknown => {
    if (depth > MAX_DEPTH) return NO_SAMPLE;
    const flags = current.flags;
    if (current.isStringLiteral() || current.isNumberLiteral()) return current.value;
    if (flags & ts.TypeFlags.BooleanLiteral) return checker.typeToString(current) === "true";
    if (flags & ts.TypeFlags.Boolean) return false;
    if (flags & ts.TypeFlags.String) return item > 0 ? `${name} ${item}` : name;
    if (flags & ts.TypeFlags.Number) return Math.max(item, 1);
    if (flags & ts.TypeFlags.Null) return null;
    // ReactNode 是很多类型的联合，当成文字
    if (/ReactNode|ReactElement|JSX\.Element/.test(checker.typeToString(current))) return name;
    if (current.isUnion()) {
      for (const part of current.types) {
        if (part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) continue;
        const sample = visit(part, name, depth, item);
        if (sample !== NO_SAMPLE) return sample;
      }
      return NO_SAMPLE;
    }
    if (!(flags & ts.TypeFlags.Object) || current.getCallSignatures().length > 0) return NO_SAMPLE;

    if (isTuple(ts, current)) {
      const items = checker
        .getTypeArguments(current as TS.TypeReference)
        .map((part, index) => visit(part, name, depth + 1, index + 1));
      return items.includes(NO_SAMPLE) ? NO_SAMPLE : items;
    }
    if (isArray(current)) {
      const element = checker.getTypeArguments(current as TS.TypeReference)[0];
      if (!element) return [];
      const items = Array.from({ length: ARRAY_LENGTH }, (_, index) =>
        visit(element, name, depth + 1, index + 1)
      );
      // 数组里的东西生成不出来：给空数组，组件至少能显示"没有数据"的样子
      return items.includes(NO_SAMPLE) ? [] : items;
    }

    const properties = current.getProperties();
    if (properties.length === 0) {
      // Record<string, X>：给一个键作例子
      const index = current.getStringIndexType();
      const sample = index ? visit(index, "key", depth + 1, item) : NO_SAMPLE;
      return sample === NO_SAMPLE ? {} : { key: sample };
    }
    const result: Record<string, unknown> = {};
    for (const property of properties) {
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      if (optional && properties.length > MAX_OPTIONAL) continue;
      const sample = visit(
        checker.getTypeOfSymbolAtLocation(property, location),
        property.name,
        depth + 1,
        item
      );
      if (sample !== NO_SAMPLE) result[property.name] = sample;
      else if (!optional) return NO_SAMPLE;
    }
    return result;
  };
  return visit(type, hint, 0, 0);
};
