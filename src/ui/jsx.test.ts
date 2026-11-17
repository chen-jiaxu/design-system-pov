import { describe, expect, it } from "vitest";

import type { ComponentInfo, PropInfo } from "../shared/manifest";
import { toJsx } from "./jsx";

const component = (props: PropInfo[], name = "Button"): ComponentInfo => ({
  exportName: name,
  file: `src/components/${name}.tsx`,
  inheritedPropCount: 0,
  name,
  props,
  styles: [],
  tokens: [],
});

const variant: PropInfo = {
  control: { kind: "select", options: ["solid", "outline"] },
  name: "variant",
  required: false,
};
const children: PropInfo = { control: { kind: "slot" }, name: "children", required: false };

describe("toJsx", () => {
  it("短的写成一行，children 放在标签中间", () => {
    expect(toJsx(component([variant, children]), { children: "保存", variant: "outline" })).toBe(
      '<Button variant="outline">保存</Button>'
    );
  });

  it("没有 children 时自闭合；开关为 true 只写名字，数字和 false 用花括号", () => {
    const props: PropInfo[] = [
      { control: { kind: "toggle" }, name: "elevated", required: false },
      { control: { kind: "toggle" }, name: "open", required: false },
      { control: { kind: "number" }, name: "count", required: false },
    ];
    expect(toJsx(component(props, "Card"), { count: 3, elevated: true, open: false })).toBe(
      "<Card elevated open={false} count={3} />"
    );
  });

  it("和默认值相同的 props 不写", () => {
    const size: PropInfo = {
      control: { kind: "select", options: ["sm", "md"] },
      defaultValue: '"md"',
      name: "size",
      required: false,
    };
    expect(toJsx(component([size, children]), { children: "保存", size: "md" })).toBe(
      "<Button>保存</Button>"
    );
    expect(toJsx(component([size]), { size: "sm" })).toBe('<Button size="sm" />');
  });

  it("没填的 props 不写，必填的函数 prop 写成空函数", () => {
    const props: PropInfo[] = [
      variant,
      { control: { kind: "function" }, name: "onClick", required: false },
      { control: { kind: "function" }, name: "onClose", required: true },
    ];
    expect(toJsx(component(props), {})).toBe("<Button onClose={() => {}} />");
  });

  it("太长时每个 prop 一行", () => {
    const props: PropInfo[] = [
      { control: { kind: "text" }, name: "title", required: true },
      { control: { kind: "text" }, name: "description", required: true },
      children,
    ];
    expect(
      toJsx(component(props, "Card"), {
        children: "内容",
        description: "一段比较长的说明文字，用来把这一行撑到超过限制",
        title: "卡片的标题",
      })
    ).toBe(
      '<Card\n  title="卡片的标题"\n  description="一段比较长的说明文字，用来把这一行撑到超过限制"\n>\n  内容\n</Card>'
    );
  });

  it('有双引号的字符串用 {"..."}', () => {
    const props: PropInfo[] = [{ control: { kind: "text" }, name: "label", required: true }];
    expect(toJsx(component(props), { label: 'say "hi"' })).toBe(
      '<Button label={"say \\"hi\\""} />'
    );
  });
});

describe("toJsx：对象、数组的 props", () => {
  const users: PropInfo = {
    control: { kind: "data", sample: [], type: "User[]" },
    name: "users",
    required: true,
  };

  it("自己写的 JSON 写成一行；用了 Mock 数据的写成变量名", () => {
    expect(toJsx(component([users], "List"), { users: '[\n  { "id": 1 }\n]' })).toBe(
      '<List users={[{"id":1}]} />'
    );
    expect(toJsx(component([users], "List"), { users: { mock: "userList" } })).toBe(
      "<List users={userList} />"
    );
  });
});
