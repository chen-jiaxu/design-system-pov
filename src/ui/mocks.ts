// Mock 数据：有名字的 JSON 数据。界面上暂时不用（新建、编辑的入口去掉了），
// 以前的工作区里存的照样能传给组件、写进生成的页面。跟着工作区存（IndexedDB）。
import { t } from "./i18n";
import { createWorkspaceStore } from "./workspace-store";

/** 名字 → JSON 文本（存的时候保证是合法的 JSON） */
export type Mocks = Record<string, string>;

const store = createWorkspaceStore<Mocks>("mocks", {});

export const useMocks = store.use;

/** JSON 文本不合法时返回原因 */
export const jsonProblem = (text: string): string | undefined => {
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** 数据是什么样的：数组几项、对象几个键 */
export const describeJson = (text: string): string => {
  try {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value)) return t().json.array(value.length);
    if (value === null) return "null";
    if (typeof value === "object") return t().json.object(Object.keys(value).length);
    const { boolean, number, string } = t().json;
    return { boolean, number, string }[typeof value as string] ?? "";
  } catch {
    return "";
  }
};
