import { useState } from "react";

// 不是组件的导出（常量、hook），分析时不应该被当成组件
export const TONES = ["success", "warning"] as const;

export const useToggle = (initial = false) => {
  const [on, setOn] = useState(initial);
  return [on, () => setOn((v) => !v)] as const;
};
