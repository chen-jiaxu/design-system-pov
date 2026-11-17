import { describe, expect, it } from "vitest";

import type { ComponentInfo, PropInfo } from "../shared/manifest";
import { initialProps, parseDefault, toRenderRequest, toVariants } from "./prop-values";

const component = (props: PropInfo[]): ComponentInfo => ({
  exportName: "Button",
  file: "src/components/Button.tsx",
  inheritedPropCount: 0,
  name: "Button",
  props,
  styles: [],
  tokens: [],
});

describe("parseDefault", () => {
  it("读出字符串、开关、数字，复杂的写法返回 undefined", () => {
    expect(parseDefault('"solid"')).toBe("solid");
    expect(parseDefault("'small'")).toBe("small");
    expect(parseDefault("false")).toBe(false);
    expect(parseDefault("8")).toBe(8);
    expect(parseDefault("[]")).toBeUndefined();
    expect(parseDefault(undefined)).toBeUndefined();
  });
});

describe("initialProps", () => {
  it("有默认值用默认值，必填的给一个值，可选且没有默认值的不传", () => {
    const values = initialProps(
      component([
        {
          control: { kind: "select", options: ["solid", "outline"] },
          defaultValue: '"outline"',
          name: "variant",
          required: false,
        },
        { control: { kind: "select", options: ["a", "b"] }, name: "tone", required: true },
        { control: { kind: "select", options: ["a", "b"] }, name: "size", required: false },
        { control: { kind: "text" }, name: "label", required: true },
        { control: { kind: "text" }, name: "href", required: true },
        { control: { kind: "number" }, name: "count", required: false },
        { control: { kind: "toggle" }, defaultValue: "false", name: "elevated", required: false },
        { control: { kind: "slot" }, name: "children", required: false },
        { control: { kind: "function" }, name: "onClick", required: false },
      ])
    );
    expect(values).toEqual({
      children: "Button",
      elevated: false,
      href: "/",
      label: "label",
      tone: "a",
      variant: "outline",
    });
  });
});

describe("toRenderRequest", () => {
  it("函数类型的 props 只传名字，组件已经没有的 props 不传", () => {
    const request = toRenderRequest(
      component([
        { control: { kind: "text" }, name: "label", required: true },
        { control: { kind: "function" }, name: "onClick", required: false },
      ]),
      { label: "保存", removed: "x" }
    );
    expect(request).toEqual({
      exportName: "Button",
      file: "src/components/Button.tsx",
      functions: ["onClick"],
      props: { label: "保存" },
      type: "dsp:render",
    });
  });
});

describe("对象、数组的 props（data）", () => {
  const users: PropInfo = {
    control: { kind: "data", sample: [{ id: 1 }], type: "User[]" },
    name: "users",
    required: true,
  };
  const extra: PropInfo = { ...users, name: "extra", required: false };

  it("必填的填上示例数据，可选的不传", () => {
    expect(initialProps(component([users, extra]))).toEqual({
      users: '[\n  {\n    "id": 1\n  }\n]',
    });
  });

  it("JSON 文本解析成值；Mock 数据用它现在的内容，删掉了的不传；外层 Provider 一起带上", () => {
    const wrappers = [{ exportName: "P", file: "P.tsx", props: {} }];
    const request = toRenderRequest(
      component([users, extra]),
      { extra: { mock: "gone" }, users: { mock: "list" } },
      { list: '[{"id":7}]' },
      wrappers
    );
    expect(request.props).toEqual({ users: [{ id: 7 }] });
    expect(request.wrappers).toBe(wrappers);
    expect(toRenderRequest(component([users]), { users: "[1, 2]" }).props).toEqual({
      users: [1, 2],
    });
    expect(toRenderRequest(component([users]), { users: "[1, 2]" }).wrappers).toBeUndefined();
  });
});

describe("@example 的示例值", () => {
  it("写了就先用它（比默认值、prop 名优先）；类型对不上、JSON 不对的不用", () => {
    const props = initialProps(
      component([
        { control: { kind: "text" }, example: "保存する", name: "label", required: true },
        { control: { kind: "text" }, example: '"引用付き"', name: "quoted", required: false },
        {
          control: { kind: "select", options: ["a", "b"] },
          defaultValue: '"a"',
          example: "b",
          name: "tone",
          required: false,
        },
        {
          control: { kind: "select", options: ["a", "b"] },
          example: "z",
          name: "wrong",
          required: true,
        },
        { control: { kind: "number" }, example: "3", name: "count", required: false },
        { control: { kind: "slot" }, example: "中身", name: "children", required: false },
        {
          control: { kind: "data", sample: [], type: "User[]" },
          example: '[{"id":1}]',
          name: "users",
          required: true,
        },
        {
          control: { kind: "data", sample: [], type: "User[]" },
          example: "not json",
          name: "broken",
          required: true,
        },
      ])
    );
    expect(props).toEqual({
      broken: "[]",
      children: "中身",
      count: 3,
      label: "保存する",
      quoted: "引用付き",
      tone: "b",
      users: '[\n  {\n    "id": 1\n  }\n]',
      wrong: "a",
    });
  });
});

describe("toVariants", () => {
  it("选项、开关的 prop 每个一行，只换这个 prop，别的用现在的值；文字、函数不列", () => {
    const button = component([
      {
        control: { kind: "select", options: ["solid", "outline"] },
        name: "variant",
        required: false,
      },
      { control: { kind: "toggle" }, name: "disabled", required: false },
      { control: { kind: "text" }, name: "label", required: true },
      { control: { kind: "function" }, name: "onClick", required: false },
    ]);
    expect(toVariants(button, { label: "保存", variant: "outline" })).toEqual([
      {
        items: [
          { label: "solid", props: { label: "保存", variant: "solid" } },
          { label: "outline", props: { label: "保存", variant: "outline" } },
        ],
        label: "variant",
      },
      {
        items: [
          { label: "false", props: { disabled: false, label: "保存", variant: "outline" } },
          { label: "true", props: { disabled: true, label: "保存", variant: "outline" } },
        ],
        label: "disabled",
      },
    ]);
  });

  it("没有能列举的 prop 时是空的", () => {
    expect(
      toVariants(component([{ control: { kind: "text" }, name: "label", required: true }]), {})
    ).toEqual([]);
  });
});
