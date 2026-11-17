import { useSyncExternalStore } from "react";

import type { Manifest } from "../shared/manifest";
import { workspace } from "./workspace";

const noop = () => () => {};

/** 分析、编译失败的原因。成功了就是 undefined */
export const useWorkspaceError = (): string | undefined =>
  useSyncExternalStore(workspace?.subscribe ?? noop, () => workspace?.getState().error);

/** 工作区的分析结果。内容变了重新分析，这里随之更新。还没分析完时是 undefined */
export const useManifest = (): Manifest | undefined =>
  useSyncExternalStore(workspace?.subscribe ?? noop, () => workspace?.getState().manifest);
