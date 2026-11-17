import { useSyncExternalStore } from "react";

/**
 * 存在浏览器里（localStorage）的一份数据，组件里用 use() 读，变了会重新渲染。
 * 只放和工作区无关的个人设定（界面的语言等）。跟着工作区的数据用 workspace-store.ts
 */
export const createLocalStore = <T>(key: string, initial: T) => {
  const storageKey = `design-system-pov:${key}`;
  const read = (): T => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === null ? initial : (JSON.parse(saved) as T);
    } catch {
      // 读不了（隐私模式、内容坏了）就当作没有
      return initial;
    }
  };
  let value = read();
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const get = () => value;
  return {
    get,
    set: (next: T) => {
      value = next;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 存不了时只在这次打开的页面里有效
      }
      for (const listener of listeners) listener();
    },
    use: () => useSyncExternalStore(subscribe, get),
  };
};
