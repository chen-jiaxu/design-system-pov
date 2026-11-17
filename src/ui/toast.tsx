import { useEffect, useSyncExternalStore } from "react";

import { t } from "./i18n";

/** 页面下方中间的提示（和 Blender 的报告一样）。报错、操作的结果在这里显示 */
export interface Toast {
  tone: "info" | "error";
  text: string;
  /** 每次显示都不同，同样的文字再显示一次也会重新计时 */
  id: number;
}

let current: Toast | undefined;
let count = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

export const showToast = (tone: Toast["tone"], text: string) => {
  current = { id: ++count, text, tone };
  emit();
};

export const hideToast = () => {
  current = undefined;
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 提示显示多久（毫秒）。报错要读，时间长一些 */
const DURATION = { error: 8000, info: 3000 };

export const Toasts = () => {
  const toast = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      if (current?.id === toast.id) hideToast();
    }, DURATION[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <button
      className="bl-toast"
      data-tone={toast.tone}
      key={toast.id}
      onClick={hideToast}
      role={toast.tone === "error" ? "alert" : "status"}
      title={t().toast.close}
      type="button"
    >
      <span aria-hidden="true" className="bl-toast-icon">
        {toast.tone === "error" ? "!" : "i"}
      </span>
      <span className="bl-toast-text">{toast.text}</span>
    </button>
  );
};
