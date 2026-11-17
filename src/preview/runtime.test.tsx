// @vitest-environment happy-dom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PreviewEvent, RenderRequest } from "./protocol";
import { startPreview } from "./runtime";

// React 的 act 需要这个标记
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Button = ({ label, onClick }: { label: string; onClick?: () => void }) => (
  <button onClick={onClick} type="button">
    {label}
  </button>
);
const Fixed = () => <b>修好了</b>;
const NewButton = ({ label }: { label: string }) => <b>{`新的${label}`}</b>;
const Broken = (): React.ReactNode => {
  throw new Error("坏掉了");
};

// 需要 Provider 的组件：没有包在 Provider 里时报错
const Name = React.createContext<string | undefined>(undefined);
const NameProvider = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <Name.Provider value={name}>{children}</Name.Provider>
);
const Greeting = () => {
  const name = React.useContext(Name);
  if (!name) throw new Error("要包在 NameProvider 里");
  return <p>你好，{name}</p>;
};

const setup = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const events: PreviewEvent[] = [];
  const handle = startPreview({
    container,
    createRoot,
    loaders: {
      "Broken.tsx": async () => ({ Broken }),
      "Button.tsx": async () => ({ Button }),
      "Greeting.tsx": async () => ({ Greeting }),
      "NameProvider.tsx": async () => ({ NameProvider }),
      "Missing.tsx": async () => {
        throw new Error("找不到文件");
      },
    },
    post: (event) => events.push(event),
    React,
  });
  const send = async (request: Partial<RenderRequest>) => {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { functions: [], props: {}, type: "dsp:render", ...request },
          origin: window.location.origin,
          source: window,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  return { container, events, handle, send };
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("startPreview", () => {
  it("收到请求后渲染组件，函数 prop 被调用时通知界面", async () => {
    const { container, events, send } = setup();
    await act(async () => {});
    expect(events).toContainEqual({ type: "dsp:ready" });

    await send({
      exportName: "Button",
      file: "Button.tsx",
      functions: ["onClick"],
      props: { label: "保存" },
    });
    expect(container.textContent).toBe("保存");
    expect(events).toContainEqual({ type: "dsp:rendered" });

    container.querySelector("button")?.click();
    expect(events).toContainEqual({ name: "onClick", type: "dsp:call" });
  });

  it("渲染出错时不崩，显示原因；换成能渲染的组件后恢复", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, events, send } = setup();
    await send({ exportName: "Broken", file: "Broken.tsx" });
    expect(container.textContent).toBe("坏掉了");
    expect(events).toContainEqual({ message: "坏掉了", type: "dsp:error" });

    await send({ exportName: "Button", file: "Button.tsx", props: { label: "好了" } });
    expect(container.textContent).toBe("好了");
  });

  it("文件加载失败、没有那个导出时，显示原因", async () => {
    const { container, events, send } = setup();
    await send({ exportName: "X", file: "Missing.tsx" });
    expect(container.textContent).toContain("组件加载失败：找不到文件");
    await send({ exportName: "Nope", file: "Button.tsx" });
    expect(container.textContent).toBe("文件里没有找到导出 Nope");
    expect(events.filter((e) => e.type === "dsp:error")).toHaveLength(2);
  });

  it("外层的 Provider 包在组件外面；找不到 Provider 时显示原因", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, send } = setup();
    const greeting = { exportName: "Greeting", file: "Greeting.tsx" };
    await send(greeting);
    expect(container.textContent).toBe("要包在 NameProvider 里");

    const wrapper = {
      exportName: "NameProvider",
      file: "NameProvider.tsx",
      props: { name: "小明" },
    };
    await send({ ...greeting, wrappers: [wrapper] });
    expect(container.textContent).toBe("你好，小明");

    await send({ ...greeting, wrappers: [{ ...wrapper, exportName: "Nope" }] });
    expect(container.textContent).toContain("预览里没有找到 Provider");
  });

  it("提示用请求里带的语言写，没带时是中文", async () => {
    const { container, send } = setup();
    await send({ exportName: "Nope", file: "Button.tsx" });
    expect(container.textContent).toBe("文件里没有找到导出 Nope");
    await send({ exportName: "Nope", file: "Button.tsx", locale: "en" });
    expect(container.textContent).toBe("The file has no export named Nope");
    await send({ exportName: "X", file: "Missing.tsx", locale: "ja" });
    expect(container.textContent).toContain("コンポーネントを読み込めませんでした");
    // 后面的测试还是用中文
    await send({ exportName: "Nope", file: "Button.tsx", locale: "zh" });
  });

  it("工作区变了（update）时换成新的组件，重新渲染最后一次请求的", async () => {
    const { container, handle, send } = setup();
    await send({ exportName: "Button", file: "Button.tsx", props: { label: "旧的" } });
    expect(container.textContent).toBe("旧的");

    await act(async () => {
      handle.update({ loaders: { "Button.tsx": async () => ({ Button: NewButton }) } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.innerHTML).toBe("<b>新的旧的</b>");
  });

  it("组件出错后代码改好了（update）：不再显示旧的错误", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, events, handle, send } = setup();
    await send({ exportName: "Broken", file: "Broken.tsx" });
    expect(container.textContent).toBe("坏掉了");

    await act(async () => {
      handle.update({ loaders: { "Broken.tsx": async () => ({ Broken: Fixed }) } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.innerHTML).toBe("<b>修好了</b>");
    expect(events.at(-1)).toEqual({ type: "dsp:rendered" });
  });
});
