import type { ReactNode } from "react";

import "./alert.css";

export interface AlertProps {
  tone?: "success" | "warning";
  /**
   * 見出し
   * @example 変更を保存しました
   */
  title: string;
  /**
   * 本文
   * @example 反映まで数分かかることがあります。
   */
  children?: ReactNode;
}

export function Alert({ tone = "success", title, children }: AlertProps) {
  return (
    <div className="app-alert" data-tone={tone} role="alert">
      <strong className="app-alert-title">{title}</strong>
      {children}
    </div>
  );
}
