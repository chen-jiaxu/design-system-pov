import type { ComponentInfo, Manifest, PropControl, TokenDefinition } from "../shared/manifest";
import { getLocale, t, useMessages } from "./i18n";
import { useMocks } from "./mocks";
import { Preview, type PreviewOptions } from "./Preview";
import { type PropValues, toRenderRequest, toVariants } from "./prop-values";
import { resolveValue, type TokenKind, tokenKind } from "./token-groups";
import { toWrappers, useEnabledProviders } from "./wrappers";

export const describeControl = (control: PropControl): string => {
  switch (control.kind) {
    case "select":
      return control.options.join(" | ");
    case "toggle":
      return t().control.toggle;
    case "text":
      return t().control.text;
    case "number":
      return t().control.number;
    case "slot":
      return t().control.slot;
    case "function":
      return t().control.function;
    case "data":
      return t().control.data(control.type);
    case "unknown":
      return t().control.unknown(control.type);
  }
};

/** token 的样子：颜色显示色块，其他显示值 */
export const TokenSample = ({
  token,
  tokens,
  size = "large",
}: {
  token: TokenDefinition;
  tokens: TokenDefinition[];
  size?: "large" | "small";
}) => {
  const value = resolveValue(token.value, tokens);
  const kind: TokenKind = tokenKind(token, tokens);
  if (kind === "color") {
    return (
      <span
        aria-hidden="true"
        className={size === "large" ? "vp-sample-color" : "pp-sample-color"}
        style={{ background: value }}
      />
    );
  }
  return size === "large" ? <code className="vp-sample-text">{value}</code> : null;
};

/** 组件显示一个，还是排出所有变体 */
export type ComponentShow = "single" | "variants";

/** 选中组件时：只显示组件本身。props 和 token 在右侧的属性面板，代码在下方的面板 */
const ComponentSheet = ({
  manifest,
  component,
  propValues,
  previewOptions,
  show,
}: {
  manifest: Manifest;
  component: ComponentInfo;
  propValues: PropValues;
  previewOptions: PreviewOptions;
  show: ComponentShow;
}) => {
  const m = useMessages().preview;
  const mocks = useMocks();
  const enabled = useEnabledProviders();
  if (component.unavailable) {
    // 知道原因的种类时用界面的语言说明，否则显示分析给的原因
    const { code, reason } = component.unavailable;
    return (
      <p className="vp-note" data-tone="warn">
        {m.unavailable(code === "async" ? m.asyncReason : reason)}
      </p>
    );
  }
  const wrappers = toWrappers(manifest.providers, enabled, mocks);
  return (
    <Preview
      options={previewOptions}
      request={{
        ...toRenderRequest(component, propValues, mocks, wrappers),
        locale: getLocale(),
        ...(show === "variants" ? { variants: toVariants(component, propValues, mocks) } : {}),
      }}
    />
  );
};

export const Viewport = ({
  manifest,
  view,
  propValues,
  previewOptions,
  show = "single",
}: {
  manifest: Manifest;
  view: { kind: "component"; component: ComponentInfo };
  /** 选中组件时，属性面板里填的 props */
  propValues: PropValues;
  previewOptions: PreviewOptions;
  show?: ComponentShow;
}) => (
  <ComponentSheet
    component={view.component}
    manifest={manifest}
    previewOptions={previewOptions}
    propValues={propValues}
    show={show}
  />
);
