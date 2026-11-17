import type { ReactNode } from "react";

import "./page-header.css";

export interface PageHeaderProps {
  /**
   * ページの見出し
   * @example ユーザー一覧
   */
  title: string;
  /**
   * 見出しの下の説明
   * @example チームのメンバーと権限を管理します
   */
  description?: string;
  /** 右側に置くボタンなど */
  children?: ReactNode;
}

/** ページのいちばん上に置く見出し */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="app-page-header">
      <div className="app-page-header-text">
        <h1 className="app-page-header-title">{title}</h1>
        {description && <p className="app-page-header-description">{description}</p>}
      </div>
      {children && <div className="app-page-header-actions">{children}</div>}
    </header>
  );
}
