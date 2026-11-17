import { useSyncExternalStore } from "react";

import { currentRecord, updateRecord } from "./session";

/**
 * 跟着工作区存的一份数据（Mock 数据、勾选的 Provider、配色方案等），组件里用 use() 读，变了会重新渲染。
 * 存在 IndexedDB 的工作区记录里，换了工作区就是另一份
 */
export const createWorkspaceStore = <T>(key: string, initial: T) => {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  // 第一次用到时再读（打开页面时工作区还没读出来）
  const get = (): T => {
    value ??= (currentRecord()?.data[key] as T | undefined) ?? initial;
    return value;
  };
  return {
    get,
    set: (next: T) => {
      value = next;
      updateRecord((record) => ({ ...record, data: { ...record.data, [key]: next } }));
      for (const listener of listeners) listener();
    },
    use: () => useSyncExternalStore(subscribe, get),
  };
};
