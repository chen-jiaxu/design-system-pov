import type { ReactNode } from "react";

import "./stack.css";

export interface StackProps {
  /** 並べる向き。column は縦、row は横 */
  direction?: "column" | "row";
  /** 間隔 */
  gap?: "small" | "medium" | "large";
  /** 揃え方。stretch は幅いっぱいに広げる */
  align?: "stretch" | "start" | "center" | "end";
  /** 横に並べるとき、入りきらなければ折り返す */
  wrap?: boolean;
  children?: ReactNode;
}

/** 中に入れたコンポーネントを縦か横に並べるレイアウト */
export function Stack({
  direction = "column",
  gap = "medium",
  align = "stretch",
  wrap = false,
  children,
}: StackProps) {
  return (
    <div
      className="app-stack"
      data-align={align}
      data-direction={direction}
      data-gap={gap}
      data-wrap={wrap || undefined}
    >
      {children}
    </div>
  );
}
