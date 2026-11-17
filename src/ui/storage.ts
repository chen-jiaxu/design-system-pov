// 工作区存在浏览器的 IndexedDB 里（一个工作区一条记录）。localStorage 每个网站只有 5 MB 左右，不够放多个工作区。
import { DB_NAME } from "../shared/app";

/** 一个文件存下来的草稿：已经应用的内容、面板里改了还没应用的内容 */
export interface SavedDraft {
  applied?: string;
  text?: string;
}

export interface WorkspaceRecord {
  id: string;
  /** 工作区的名字。顶栏上显示，导出的 zip 也用它命名 */
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 原本的内容（新建时的模板）："变更"和"放弃改动"以它为准 */
  base: Record<string, string>;
  /** 改过、新建的文件 */
  drafts: Record<string, SavedDraft>;
  /** 其他数据：勾选的 Provider、Design Token 的方案等。键 → 值 */
  data: Record<string, unknown>;
  /** 写了几次。别的标签页改过时用它发现，不互相覆盖 */
  revision?: number;
}

export type WorkspaceSummary = Pick<WorkspaceRecord, "id" | "name" | "updatedAt">;

const STORE = "workspaces";

let opening: Promise<IDBDatabase> | undefined;

const open = () => {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
};

/** 一个事务。写的时候等事务真正完成（oncomplete）再算写好了 */
const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
  });
};

/** 所有工作区，最近改过的在前 */
export const listWorkspaces = async (): Promise<WorkspaceSummary[]> => {
  const all = await run<WorkspaceRecord[]>("readonly", (store) => store.getAll());
  return all
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const loadWorkspace = (id: string) =>
  run<WorkspaceRecord | undefined>("readonly", (store) => store.get(id));

export const saveWorkspace = (record: WorkspaceRecord) =>
  run("readwrite", (store) => store.put(record));

export const removeWorkspace = (id: string) => run("readwrite", (store) => store.delete(id));

/**
 * 存回去，但存着的版本还是 expected 时才写（别的标签页写过、删掉了时不写）。
 * 读和写在同一个事务里，中间不会被别的标签页插进来
 */
export const saveIfUnchanged = async (
  record: WorkspaceRecord,
  expected: number
): Promise<"saved" | "conflict" | "deleted"> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    let result: "saved" | "conflict" | "deleted" = "saved";
    const read = store.get(record.id);
    read.onsuccess = () => {
      const stored = read.result as WorkspaceRecord | undefined;
      if (!stored) result = "deleted";
      else if ((stored.revision ?? 0) !== expected) result = "conflict";
      else store.put({ ...record, revision: expected + 1 });
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
  });
};
