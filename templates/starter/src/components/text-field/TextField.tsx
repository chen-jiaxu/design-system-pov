import { useId } from "react";

import "./text-field.css";

export interface TextFieldProps {
  /**
   * 入力欄の名前
   * @example メールアドレス
   */
  label: string;
  /**
   * 何も入っていないときに出す例
   * @example name@example.com
   */
  placeholder?: string;
  /** 入力欄の下に出す補足 */
  hint?: string;
  /** 入力内容の誤りを伝える文。あると赤い枠になる */
  error?: string;
  /** 必須（名前の横に * を出す） */
  required?: boolean;
  disabled?: boolean;
}

export function TextField({
  label,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
}: TextFieldProps) {
  const id = useId();
  return (
    <div className="app-text-field" data-invalid={error ? true : undefined}>
      <label className="app-text-field-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        aria-invalid={error ? true : undefined}
        className="app-text-field-input"
        disabled={disabled}
        id={id}
        placeholder={placeholder}
        required={required}
      />
      {(error || hint) && <span className="app-text-field-hint">{error || hint}</span>}
    </div>
  );
}
