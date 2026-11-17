import type { ButtonHTMLAttributes, ReactNode } from "react";

import "./button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 見た目 */
  variant?: "solid" | "outline";
  size?: "small" | "large";
  /**
   * ボタンの文字
   * @example 保存する
   */
  children?: ReactNode;
}

export const Button = ({ variant = "solid", size = "small", ...rest }: ButtonProps) => (
  <button {...rest} className="app-button" data-size={size} data-variant={variant} type="button" />
);
