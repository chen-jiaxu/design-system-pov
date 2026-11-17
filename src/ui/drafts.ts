// 代码面板里各个文件的内容：原本的、面板里正在改的、已经应用到预览的。
// 放在组件外面，切换文件 tab、切换组件后再回来，改的内容还在。
// 应用的内容交给工作区（src/ui/workspace.ts）。面板里的内容和应用的内容都存在工作区的记录里（IndexedDB）。
import { useEffect, useSyncExternalStore } from "react";

import { t } from "./i18n";
import { currentRecord, updateRecord } from "./session";
import type { SavedDraft } from "./storage";
import { showToast } from "./toast";
import { workspace } from "./workspace";

export interface FileState {
  /** 原本的内容（新建的是空的）。还没读到时是 undefined */
  original?: string;
  /** 面板里的内容。没改过时和 original 一样 */
  text?: string;
  /** 已经应用到预览的内容。和原本的一样时是 undefined */
  applied?: string;
}

const files = new Map<string, FileState>();
const listeners = new Set<() => void>();
const EMPTY: FileState = {};

const readSaved = (): Record<string, SavedDraft> => currentRecord()?.drafts ?? {};

/** 把现在有改动的文件存进工作区（IndexedDB） */
const persist = () => {
  const saved: Record<string, SavedDraft> = {};
  for (const [file, state] of files) {
    const text = state.text !== (state.applied ?? state.original) ? state.text : undefined;
    if (state.applied !== undefined || text !== undefined) {
      saved[file] = { applied: state.applied, text };
    }
  }
  // 只是打开看了文件、内容没变时不算改动（不更新工作区的修改时间）
  updateRecord((record) =>
    JSON.stringify(record.drafts) === JSON.stringify(saved) ? record : { ...record, drafts: saved }
  );
};

const update = (file: string, change: (state: FileState) => FileState) => {
  files.set(file, change(files.get(file) ?? EMPTY));
  persist();
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 面板里的内容和原本的不一样（"变更"tab 里能看到） */
export const isChanged = (state: FileState) =>
  state.text !== undefined && state.text !== state.original;

/** 面板里的内容还没有应用到预览（要按保存） */
export const isUnsaved = (state: FileState) =>
  state.text !== undefined && state.text !== (state.applied ?? state.original);

let markRestored: () => void = () => {};
/** 草稿放回面板以后再读文件，免得把"还没放回来"当成"没有改过" */
const restored = new Promise<void>((resolve) => {
  markRestored = resolve;
});

/**
 * 打开页面时：把工作区里存的草稿放回面板。已经应用过的内容工作区打开时已经有了（见 workspace.ts）
 */
export const initDrafts = () => {
  for (const [file, draft] of Object.entries(readSaved())) {
    files.set(file, { applied: draft.applied, text: draft.text ?? draft.applied });
  }
  markRestored();
};

const load = async (file: string) => {
  await restored;
  // 新建的组件原本没有：原来的内容算作空的
  const original = workspace?.original(file) ?? "";
  const applied = workspace?.getDraft(file);
  update(file, (state) => ({
    applied,
    original,
    text: isChanged(state) ? state.text : (applied ?? original),
  }));
};

/** 文件的内容。第一次用到时读取，文件保存后重新读 */
export const useFile = (file: string): FileState => {
  useEffect(() => {
    load(file);
  }, [file]);
  return useSyncExternalStore(subscribe, () => files.get(file) ?? EMPTY);
};

/** 这些文件里改过的 */
export const useChangedFiles = (names: string[]): string[] => {
  useSyncExternalStore(subscribe, () => files.size + [...files.values()].filter(isChanged).length);
  return names.filter((name) => isChanged(files.get(name) ?? EMPTY));
};

export const editFile = (file: string, text: string) =>
  update(file, (state) => ({ ...state, text }));

/** 现在所有的草稿：改过的文件和新建的组件。路径 → 面板里的内容 */
const draftFiles = (): Record<string, string> => {
  const drafts: Record<string, string> = {};
  for (const [file, state] of files) {
    if (state.text !== undefined && (isChanged(state) || state.applied !== undefined)) {
      drafts[file] = state.text;
    }
  }
  return drafts;
};

let draftsSnapshot: Record<string, string> = {};
/** 现在所有的草稿（状态栏显示个数、导出时用）。内容没变时返回同一个对象 */
export const useDraftFiles = (): Record<string, string> =>
  useSyncExternalStore(subscribe, () => {
    const next = draftFiles();
    if (JSON.stringify(next) !== JSON.stringify(draftsSnapshot)) draftsSnapshot = next;
    return draftsSnapshot;
  });

/** 交给工作区。不成功时返回原因 */
const apply = async (file: string, text: string | undefined): Promise<string | undefined> => {
  if (!workspace) return t().drafts.noWorkspace;
  try {
    return await workspace.setDraft(file, text);
  } catch (error) {
    return String(error);
  }
};

/**
 * 同一个文件的操作按顺序一个一个做。保存要等 Worker 检查语法，
 * 不排队的话"保存后马上放弃"会被晚到的保存盖回去
 */
const queues = new Map<string, Promise<unknown>>();
const enqueue = <T>(file: string, task: () => Promise<T>): Promise<T> => {
  const next = (queues.get(file) ?? Promise.resolve()).then(task, task);
  queues.set(
    file,
    next.catch(() => {})
  );
  return next;
};

/** 保存：把面板里的内容应用到预览。语法有错时不应用，提示原因 */
export const saveFile = (file: string) => {
  const state = files.get(file);
  if (!state || state.text === undefined || !isUnsaved(state)) return Promise.resolve();
  const text = state.text;
  const back = text === state.original;
  return enqueue(file, async () => {
    const error = await apply(file, back ? undefined : text);
    if (error) {
      showToast("error", t().drafts.applyFailed(error));
      return;
    }
    update(file, (now) => ({ ...now, applied: back ? undefined : text }));
    showToast("info", t().drafts.applied);
  });
};

/**
 * 由界面生成、不让人直接改的文件（src/tokens.css）：直接换掉原本的内容，不算草稿，
 * "全部放弃"也不会动它
 */
export const writeManagedFile = (file: string, text: string) => {
  if (!workspace) return;
  workspace.setBase(file, text);
  updateRecord((record) =>
    record.base[file] === text ? record : { ...record, base: { ...record.base, [file]: text } }
  );
  update(file, () => ({ original: text, text }));
};

/**
 * 直接写入并应用（画布这种不经过代码面板的地方用）。和原本的内容一样时去掉草稿。
 * 不成功时提示原因
 */
export const writeFile = (file: string, text: string) => {
  const original = workspace?.original(file) ?? "";
  const applied = text === original ? undefined : text;
  update(file, (state) => ({ ...state, applied, original, text }));
  return enqueue(file, async () => {
    const error = await apply(file, applied);
    if (error) showToast("error", t().drafts.applyFailed(error));
  });
};

/** 新建文件：放进工作区的草稿。成功时返回 true；不成功时提示原因，返回 false */
export const createFile = (file: string, text: string): Promise<boolean> =>
  enqueue(file, async () => {
    const error = await apply(file, text);
    if (error) {
      showToast("error", t().drafts.createFailed(error));
      return false;
    }
    update(file, () => ({ applied: text, original: "", text }));
    return true;
  });

/** 放弃改动：面板和预览都回到原本的内容。新建的组件原本没有，放弃就是删掉 */
export const discardFile = (file: string) => {
  if (!files.get(file)) return Promise.resolve();
  update(file, (now) => ({ ...now, text: now.original }));
  // 排在前面的保存做完以后再看要不要撤回
  return enqueue(file, async () => {
    const state = files.get(file);
    if (!state || (state.applied === undefined && workspace?.getDraft(file) === undefined)) return;
    const error = await apply(file, undefined);
    if (error) {
      showToast("error", t().drafts.revertFailed(error));
      return;
    }
    update(file, (now) => ({ ...now, applied: undefined, text: now.original }));
  });
};

/** 放弃全部草稿：改过的文件回到原本的内容，新建的组件删掉 */
export const discardAllFiles = async () => {
  for (const file of Object.keys(draftFiles())) await discardFile(file);
};
