import "./tag.css";

export interface TagProps {
  /**
   * タグの文字
   * @example デザイン
   */
  label: string;
  size?: "sm" | "md";
  /** 削除できる（右に × を出す） */
  removable?: boolean;
  onRemove?: () => void;
}

export function Tag({ label, size = "md", removable = false, onRemove }: TagProps) {
  return (
    <span className="app-tag" data-size={size}>
      {label}
      {removable && (
        <button aria-label="削除" className="app-tag__remove" onClick={onRemove} type="button">
          ×
        </button>
      )}
    </span>
  );
}
