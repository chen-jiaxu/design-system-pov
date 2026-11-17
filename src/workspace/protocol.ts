// 界面和分析、编译用的 Worker 之间的消息

import type { PreviewModule } from "../preview/modules";
import type { Locale } from "../preview/protocol";
import type { Manifest } from "../shared/manifest";

export type WorkerRequest = { id: number; locale?: Locale } & (
  | {
      type: "build";
      /** 工作区原本的内容：相对路径 → 内容 */
      base: Record<string, string>;
      /** 改过、新建的内容 */
      drafts: Record<string, string>;
      componentsDir: string;
      name: string;
    }
  | { type: "check"; file: string; text: string }
);

export type WorkerResponse = { id: number } & (
  | { type: "build"; manifest: Manifest; modules: Record<string, PreviewModule> }
  | { type: "check"; error?: string }
  | { type: "error"; message: string }
);
