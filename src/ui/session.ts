// 现在打开的工作区。打开页面时从 IndexedDB 读出来放在内存里，改动稍后写回去。
// 切换工作区时重新加载页面（各处的状态都从新的工作区重新读，不会混在一起）。
// 同一个工作区在别的标签页里也开着时：谁先写谁赢，后写的一方不覆盖，提示重新加载。
import { DB_NAME } from "../shared/app";
import { STARTER_NAME, starterFiles } from "../workspace/template";
import {
  listWorkspaces,
  loadWorkspace,
  removeWorkspace,
  saveIfUnchanged,
  saveWorkspace,
  type WorkspaceRecord,
} from "./storage";

/** 上次打开的工作区（每个浏览器自己记） */
const CURRENT_KEY = `${DB_NAME}:current`;

/**
 * 保存的状态。
 * memory：浏览器存不了（隐私模式等），只在这次打开的页面里；error：写失败了，下次改动时再试；
 * conflict：别的标签页改过这个工作区；deleted：别的标签页删掉了它。后两种不再写，要重新加载
 */
export type SaveStatus =
  | { kind: "ok" }
  | { kind: "memory" }
  | { kind: "error"; message: string }
  | { kind: "conflict" }
  | { kind: "deleted" };

let current: WorkspaceRecord | undefined;
/** 读出来时（或上次写好时）的版本 */
let revision = 0;
let status: SaveStatus = { kind: "ok" };
/** 内存里有还没写进 IndexedDB 的改动 */
let dirty = false;
const listeners = new Set<() => void>();
/** 写之前要先交出改动的地方（画布、Design Token 的稍后写） */
const flushers = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

export const currentRecord = () => current;
export const saveStatus = () => status;
export const isPersistent = () => status.kind !== "memory";

export const subscribeRecord = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 稍后才写进工作区的改动，在写 IndexedDB 之前先交出来 */
export const registerFlush = (flush: () => void) => {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
};

const setStatus = (next: SaveStatus) => {
  status = next;
  notify();
};

/** 和别的标签页说"我写了 / 删了" */
const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(DB_NAME);
channel?.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as { id: string; revision?: number; deleted?: boolean };
  if (!current || data.id !== current.id) return;
  if (data.deleted) setStatus({ kind: "deleted" });
  else if ((data.revision ?? 0) > revision) setStatus({ kind: "conflict" });
});

let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();

/** 写进 IndexedDB。前一次还没写完时排在后面 */
const save = (): Promise<void> => {
  clearTimeout(timer);
  timer = undefined;
  for (const flush of flushers) flush();
  saving = saving.then(async () => {
    if (!current || !dirty) return;
    if (status.kind === "memory" || status.kind === "conflict" || status.kind === "deleted") return;
    dirty = false;
    const record = current;
    try {
      const result = await saveIfUnchanged(record, revision);
      if (result === "saved") {
        revision += 1;
        if (status.kind !== "ok") setStatus({ kind: "ok" });
        channel?.postMessage({ id: record.id, revision });
      } else {
        setStatus({ kind: result });
      }
    } catch (error) {
      dirty = true;
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  });
  return saving;
};

/** 写失败以后再试一次 */
export const retrySave = () => {
  dirty = true;
  return save();
};

/** 改现在的工作区。稍后写进 IndexedDB */
export const updateRecord = (change: (record: WorkspaceRecord) => WorkspaceRecord) => {
  if (!current) return;
  const next = change(current);
  if (next === current) return;
  current = { ...next, updatedAt: Date.now() };
  dirty = true;
  notify();
  clearTimeout(timer);
  timer = setTimeout(save, 300);
};

if (typeof window !== "undefined") {
  // 关页面、切到别的标签页时马上写
  window.addEventListener("pagehide", () => {
    save();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** 新的工作区。files 不给时用模板 */
export const newRecord = (
  name: string,
  files: Record<string, string> = starterFiles,
  data: Record<string, unknown> = {}
): WorkspaceRecord => {
  const now = Date.now();
  return {
    base: { ...files },
    createdAt: now,
    data,
    drafts: {},
    id: newId(),
    name,
    revision: 0,
    updatedAt: now,
  };
};

const rememberCurrent = (id: string) => {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    // 记不住时下次打开最近改过的
  }
};

const rememberedId = () => {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * 打开页面时：读上次打开的工作区；没有时打开最近改过的；一个也没有时从模板新建一个。
 * defaultName 是新建时的名字
 */
export const openSession = async (defaultName: string): Promise<WorkspaceRecord> => {
  try {
    const list = await listWorkspaces();
    const id = list.find((w) => w.id === rememberedId())?.id ?? list[0]?.id;
    const found = id ? await loadWorkspace(id) : undefined;
    current = found ?? newRecord(defaultName || STARTER_NAME);
    if (!found) await saveWorkspace(current);
    revision = current.revision ?? 0;
  } catch {
    current = newRecord(defaultName || STARTER_NAME);
    status = { kind: "memory" };
  }
  rememberCurrent(current.id);
  return current;
};

/** 打开别的工作区：现在的写完以后重新加载页面 */
export const switchWorkspace = async (id: string) => {
  await save();
  rememberCurrent(id);
  window.location.reload();
};

/** 新建工作区并打开它。files、data 不给时从模板开始 */
export const createWorkspace = async (
  name: string,
  files?: Record<string, string>,
  data?: Record<string, unknown>
) => {
  const record = newRecord(name, files, data);
  await saveWorkspace(record);
  await switchWorkspace(record.id);
};

export const renameWorkspace = (name: string) => updateRecord((record) => ({ ...record, name }));

/** 删掉现在的工作区，打开另一个（没有别的时新建一个）。失败时现在的工作区照常能用 */
export const deleteCurrentWorkspace = async () => {
  if (!current) return;
  if (status.kind === "memory") {
    window.location.reload();
    return;
  }
  const id = current.id;
  clearTimeout(timer);
  timer = undefined;
  await removeWorkspace(id);
  channel?.postMessage({ deleted: true, id });
  current = undefined;
  const next = (await listWorkspaces())[0];
  if (next) {
    rememberCurrent(next.id);
  } else {
    try {
      localStorage.removeItem(CURRENT_KEY);
    } catch {
      // 记不住也没关系，下次打开会新建
    }
  }
  window.location.reload();
};
