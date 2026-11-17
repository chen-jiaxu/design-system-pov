import "./stat.css";

export interface StatProps {
  /**
   * 指標の名前
   * @example 今月の売上
   */
  label: string;
  /**
   * 値
   * @example ¥12,480,000
   */
  value: string;
  /**
   * 前の期間との差
   * @example +8.2%
   */
  change?: string;
  /** 良くなったか悪くなったか。色が変わる */
  trend?: "up" | "down" | "flat";
}

const ARROW = { down: "↓", flat: "→", up: "↑" } as const;

/** ダッシュボードに並べる数字 */
export function Stat({ label, value, change, trend = "flat" }: StatProps) {
  return (
    <div className="app-stat">
      <span className="app-stat-label">{label}</span>
      <strong className="app-stat-value">{value}</strong>
      {change && (
        <span className="app-stat-change" data-trend={trend}>
          {ARROW[trend]} {change}
        </span>
      )}
    </div>
  );
}
