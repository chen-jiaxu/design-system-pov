import type { ReactNode } from "react";

import "./card.css";

export interface CardProps {
  /**
   * カードの見出し
   * @example 基本情報
   */
  title: string;
  children?: ReactNode;
  /** 影をつけて浮かせる */
  elevated?: boolean;
  onClose?: () => void;
}

export function Card({ title, children, elevated = false }: CardProps) {
  return (
    <section className="app-card" data-elevated={elevated || undefined}>
      <h2 className="app-card-title">{title}</h2>
      {children}
    </section>
  );
}
