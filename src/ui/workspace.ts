// 浏览器里的工作区：原本的内容（模板）加上界面里改过、新建的内容（草稿）。
// 分析和编译交给 Worker，结果变了时通知界面。不经过服务器。
import type { PreviewModule } from "../preview/modules";
import { DEFAULT_COMPONENTS_DIR } from "../shared/components-dir";
import type { Manifest } from "../shared/manifest";
import type { WorkerRequest, WorkerResponse } from "../workspace/protocol";
import { getLocale } from "./i18n";
import type { WorkspaceRecord } from "./storage";

export interface WorkspaceState {
  /** 分析结果。第一次分析完之前是 undefined */
  manifest?: Manifest;
  /** 编译好的文件，交给预览页 */
  modules?: Record<string, PreviewModule>;
  /** 分析失败的原因 */
  error?: string;
}

type Request = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, "id"> : never) : never;

export const createWorkspace = (options: {
  name: string;
  base: Readonly<Record<string, string>>;
  /** 打开时就有的改动（上次已经应用过的） */
  drafts?: Readonly<Record<string, string>>;
  componentsDir?: string;
  createWorker?: () => Worker;
}) => {
  const componentsDir = options.componentsDir ?? DEFAULT_COMPONENTS_DIR;
  const base = { ...options.base };
  const drafts: Record<string, string> = { ...options.drafts };
  let state: WorkspaceState = {};
  const listeners = new Set<() => void>();
  // 文件改了几次。页面列表等直接看文件的地方用它判断要不要重新读
  let filesVersion = 0;

  const createWorker =
    options.createWorker ??
    (() => new Worker(new URL("../workspace/worker.ts", import.meta.url), { type: "module" }));
  let nextId = 0;
  const pending = new Map<number, (response: WorkerResponse) => void>();
  let worker: Worker | undefined;
  /** 用到时才建 Worker。坏掉以后下一次请求重新建一个（网络恢复后就好了） */
  const getWorker = () => {
    if (worker) return worker;
    const created = createWorker();
    created.onmessage = (event: MessageEvent<WorkerResponse>) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
    // Worker 自己没能加载（网络断了等）：等着的请求都当作失败，不让界面一直停在"分析中"
    created.onerror = (event) => {
      event.preventDefault?.();
      const message = event.message || "Worker failed to load";
      for (const [id, resolve] of pending) resolve({ id, message, type: "error" });
      pending.clear();
      created.terminate();
      if (worker === created) worker = undefined;
    };
    worker = created;
    return created;
  };
  const call = (request: Request) =>
    new Promise<WorkerResponse>((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      getWorker().postMessage({ ...request, id, locale: getLocale() } as WorkerRequest);
    });

  const setState = (next: WorkspaceState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  // 改动连着来时只分析最后一次；分析中又有改动时，做完再分析一次
  let building = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const build = async () => {
    if (building) {
      dirty = true;
      return;
    }
    building = true;
    const response = await call({
      base,
      componentsDir,
      drafts: { ...drafts },
      name: options.name,
      type: "build",
    });
    building = false;
    if (response.type === "build") {
      setState({ manifest: response.manifest, modules: response.modules });
    } else if (response.type === "error") {
      // 上一次的分析结果留着，界面照样能用
      setState({ ...state, error: response.message });
    }
    if (dirty) {
      dirty = false;
      build();
    }
  };
  const scheduleBuild = () => {
    clearTimeout(timer);
    timer = setTimeout(build, 30);
  };
  scheduleBuild();

  return {
    componentsDir,
    getState: () => state,
    getFilesVersion: () => filesVersion,
    /** 分析失败以后再试一次 */
    retry: () => scheduleBuild(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 原本的内容。原本没有（新建的）时是 undefined */
    original: (file: string): string | undefined => base[file],
    getDraft: (file: string): string | undefined => drafts[file],
    /** 换掉原本的内容（由界面生成的文件用）。这个文件的草稿一起去掉 */
    setBase: (file: string, text: string) => {
      if (base[file] === text && drafts[file] === undefined) return;
      base[file] = text;
      delete drafts[file];
      filesVersion++;
      for (const listener of listeners) listener();
      scheduleBuild();
    },
    /** 原本的内容加上草稿：现在工作区里所有的文件 */
    files: (): Record<string, string> => ({ ...base, ...drafts }),
    /**
     * 改文件的内容（text 为 undefined 时回到原本的内容，新建的就是删掉）。
     * 语法有错时不采用，返回原因；采用了返回 undefined，并重新分析、编译
     */
    setDraft: async (file: string, text: string | undefined): Promise<string | undefined> => {
      if (text !== undefined) {
        const response = await call({ file, text, type: "check" });
        if (response.type === "error") return response.message;
        if (response.type === "check" && response.error) return response.error;
      }
      if (text === undefined || text === base[file]) delete drafts[file];
      else drafts[file] = text;
      filesVersion++;
      for (const listener of listeners) listener();
      scheduleBuild();
      return undefined;
    },
  };
};

export type Workspace = ReturnType<typeof createWorkspace>;

/** 界面用的工作区。打开页面时由 initWorkspace 建好（见 main.tsx） */
export let workspace: Workspace | undefined;

/** 用存下来的工作区打开：原本的内容加上已经应用过的改动 */
export const initWorkspace = (record: WorkspaceRecord) => {
  if (typeof Worker === "undefined") return;
  const drafts: Record<string, string> = {};
  for (const [file, draft] of Object.entries(record.drafts)) {
    if (draft.applied !== undefined) drafts[file] = draft.applied;
  }
  workspace = createWorkspace({ base: record.base, drafts, name: record.name });
};
