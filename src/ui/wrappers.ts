// 外层 Provider：预览时包在组件外面的 Provider。对所有组件生效（和真实项目里包在最外层一样）。
// 勾选了哪些、各自的 props 跟着工作区存（IndexedDB）。
import type { Wrapper } from "../preview/protocol";
import type { ComponentInfo, ProviderInfo } from "../shared/manifest";
import type { Mocks } from "./mocks";
import { initialProps, type PropValues, toProps } from "./prop-values";
import { createWorkspaceStore } from "./workspace-store";

/** Provider 的"文件#导出名" → 它的 props。有这个键就是勾选了 */
type Enabled = Record<string, PropValues>;

const store = createWorkspaceStore<Enabled>("providers", {});

export const useEnabledProviders = store.use;

export const providerId = (provider: ProviderInfo) => `${provider.file}#${provider.exportName}`;

/** 借用组件的 props 处理（初始值、换成真正的值） */
const asComponent = (provider: ProviderInfo): ComponentInfo => ({
  ...provider,
  inheritedPropCount: 0,
  styles: [],
  tokens: [],
});

export const toggleProvider = (provider: ProviderInfo, on: boolean) => {
  const { [providerId(provider)]: _, ...rest } = store.get();
  store.set(on ? { ...rest, [providerId(provider)]: initialProps(asComponent(provider)) } : rest);
};

export const setProviderProp = (
  provider: ProviderInfo,
  name: string,
  value: PropValues[string] | undefined
) => {
  const id = providerId(provider);
  const { [name]: _, ...props } = store.get()[id] ?? {};
  store.set({ ...store.get(), [id]: value === undefined ? props : { ...props, [name]: value } });
};

/** 发给预览的 Provider 列表，从外到里（按工作区里找到的顺序）。只带现在工作区里还有的 */
export const toWrappers = (providers: ProviderInfo[], enabled: Enabled, mocks: Mocks): Wrapper[] =>
  providers
    .filter((provider) => providerId(provider) in enabled)
    .map((provider) => ({
      exportName: provider.exportName,
      file: provider.file,
      props: toProps(asComponent(provider), enabled[providerId(provider)] ?? {}, mocks),
    }));
