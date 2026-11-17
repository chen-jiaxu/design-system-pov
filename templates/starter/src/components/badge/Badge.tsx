import "./badge.css";

type Tone = "success" | "warning";

export default function Badge({
  tone = "success",
  label,
  count,
}: {
  tone?: Tone;
  /**
   * バッジの文字
   * @example 新着
   */
  label: string;
  /** 件数 */
  count?: number;
}) {
  return (
    <span className="app-badge" data-tone={tone}>
      {label}
      {count}
    </span>
  );
}
