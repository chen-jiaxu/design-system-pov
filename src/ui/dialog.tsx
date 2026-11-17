// 界面里自己的确认框、输入框（代替浏览器的 confirm / prompt）。用 await confirmDialog(...) 这样调用。
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useMessages } from "./i18n";

interface Request {
  message: string;
  /** 按下去的按钮上的字。不给时是"确定" */
  confirm?: string;
  /** 删除这类做了就回不去的操作：按钮显示成警告的颜色 */
  danger?: boolean;
  /** 有这个就是输入框：初始的内容 */
  input?: string;
  /** 输入的内容不能用时返回原因（显示在输入框下面） */
  validate?: (value: string) => string | undefined;
  /** 有这个就是从几项里选一个：点了哪项就是哪项 */
  choices?: Choice[];
  resolve: (value: string | boolean | undefined) => void;
}

export interface Choice {
  value: string;
  label: string;
  description?: string;
}

let current: Request | undefined;
const listeners = new Set<() => void>();
const show = (request: Request | undefined) => {
  current = request;
  for (const listener of listeners) listener();
};

/** 确认。按了确定是 true */
export const confirmDialog = (options: { message: string; confirm?: string; danger?: boolean }) =>
  new Promise<boolean>((resolve) => {
    current?.resolve(undefined);
    show({ ...options, resolve: (value) => resolve(value === true) });
  });

/** 输入。取消时是 undefined；validate 返回原因时不能按确定 */
export const promptDialog = (options: {
  message: string;
  value?: string;
  confirm?: string;
  validate?: (value: string) => string | undefined;
}) =>
  new Promise<string | undefined>((resolve) => {
    current?.resolve(undefined);
    show({
      ...options,
      input: options.value ?? "",
      resolve: (value) => resolve(typeof value === "string" ? value : undefined),
    });
  });

/** 从几项里选一个。取消时是 undefined */
export const chooseDialog = (options: { message: string; choices: Choice[] }) =>
  new Promise<string | undefined>((resolve) => {
    current?.resolve(undefined);
    show({
      ...options,
      resolve: (value) => resolve(typeof value === "string" ? value : undefined),
    });
  });

export const Dialogs = () => {
  const m = useMessages().dialog;
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current
  );
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!request) return;
    setValue(request.input ?? "");
    requestAnimationFrame(() => {
      if (request.input !== undefined) input.current?.select();
      else if (request.choices) first.current?.focus();
      else ok.current?.focus();
    });
  }, [request]);
  if (!request) return null;

  const asking = request.input !== undefined;
  const trimmed = value.trim();
  const problem = asking ? request.validate?.(trimmed) : undefined;
  const close = (answer: string | boolean | undefined) => {
    show(undefined);
    request.resolve(answer);
  };
  const submit = () => {
    if (request.choices) return;
    if (asking && problem) return;
    close(asking ? trimmed : true);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 点外面关掉（键盘用 Esc）
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc 在对话框里处理
    <div
      className="dl-backdrop"
      onClick={(event) => event.target === event.currentTarget && close(undefined)}
    >
      <form
        aria-modal="true"
        className="dl"
        onKeyDown={(event) => {
          if (event.key === "Escape") close(undefined);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        role="dialog"
      >
        <p className="dl-message">{request.message}</p>
        {asking && (
          <>
            <input
              aria-invalid={problem !== undefined}
              className="dl-input"
              onChange={(event) => setValue(event.target.value)}
              ref={input}
              value={value}
            />
            {problem && trimmed !== "" && <p className="dl-problem">{problem}</p>}
          </>
        )}
        {request.choices && (
          <div className="dl-choices">
            {request.choices.map((choice, index) => (
              <button
                className="dl-choice"
                key={choice.value}
                onClick={() => close(choice.value)}
                ref={index === 0 ? first : undefined}
                type="button"
              >
                <strong>{choice.label}</strong>
                {choice.description && <span>{choice.description}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="dl-actions">
          <button className="dl-button" onClick={() => close(undefined)} type="button">
            {m.cancel}
          </button>
          {!request.choices && (
            <button
              className="dl-button dl-primary"
              data-danger={request.danger || undefined}
              disabled={asking && problem !== undefined}
              ref={ok}
              type="submit"
            >
              {request.confirm ?? m.ok}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
