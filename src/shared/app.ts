/** 产品名。来自环境变量 VITE_APP_NAME（根目录的 .env），没设时用这个 */
export const APP_NAME = import.meta.env.VITE_APP_NAME || "Design System POV";

/**
 * 内部用的名字：IndexedDB、localStorage 的键。固定不变，
 * 产品名（VITE_APP_NAME）改了也能读到以前存的工作区
 */
export const DB_NAME = "design-system-pov";
