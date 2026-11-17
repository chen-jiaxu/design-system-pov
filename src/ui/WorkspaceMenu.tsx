// 顶栏右边的工作区菜单：显示现在的工作区，能切换、新建、改名、删除。
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readZip } from "../shared/zip";
import { confirmDialog, promptDialog } from "./dialog";
import { importFiles } from "./export";
import { t, useMessages } from "./i18n";
import {
  createWorkspace,
  currentRecord,
  deleteCurrentWorkspace,
  isPersistent,
  renameWorkspace,
  retrySave,
  saveStatus,
  subscribeRecord,
  switchWorkspace,
} from "./session";
import { listWorkspaces, type WorkspaceSummary } from "./storage";
import { showToast } from "./toast";

const MAX_NAME = 40;

/** 名字不能用时返回原因 */
export const checkWorkspaceName = (
  name: string,
  list: WorkspaceSummary[],
  except?: string
): string | undefined => {
  if (name === "") return t().workspace.nameRequired;
  if ([...name].length > MAX_NAME) return t().workspace.tooLong;
  if (list.some((w) => w.name === name && w.id !== except)) return t().workspace.exists(name);
  return undefined;
};

/** 问名字。不能用时在输入框下面写明原因 */
const askName = (message: string, initial: string, list: WorkspaceSummary[], except?: string) =>
  promptDialog({
    message,
    validate: (value) => checkWorkspaceName(value, list, except),
    value: initial,
  });

/** 导出的 zip 等文件名用的写法：去掉文件名里不能用的字 */
export const fileNameOf = (name: string) => name.replace(/[\\/:*?"<>|\s]+/g, "-") || "workspace";

export const WorkspaceMenu = () => {
  const m = useMessages().workspace;
  const record = useSyncExternalStore(subscribeRecord, currentRecord);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<WorkspaceSummary[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    listWorkspaces()
      .then(setList)
      .catch(() => setList([]));
    // 点菜单以外的地方关掉
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!record) return null;

  const create = async () => {
    setOpen(false);
    const name = await askName(m.createPrompt, "", list);
    if (name) createWorkspace(name).catch((error) => showToast("error", String(error)));
  };
  const rename = async () => {
    setOpen(false);
    const name = await askName(m.renamePrompt, record.name, list, record.id);
    if (name) renameWorkspace(name);
  };
  const importZip = async (file: File) => {
    try {
      const imported = importFiles(await readZip(new Uint8Array(await file.arrayBuffer())));
      if (!imported) {
        showToast("error", m.importNotWorkspace);
        return;
      }
      const suggested = file.name.replace(/\.zip$/i, "");
      const taken = new Set(list.map((w) => w.name));
      let name = suggested;
      for (let n = 2; taken.has(name); n++) name = `${suggested} (${n})`;
      const chosen = await askName(m.importPrompt, name, list);
      if (!chosen) return;
      await createWorkspace(
        chosen,
        imported.files,
        imported.tokens ? { designTokens: imported.tokens } : {}
      );
    } catch (error) {
      showToast("error", m.importFailed(error instanceof Error ? error.message : String(error)));
    }
  };
  const remove = () => {
    setOpen(false);
    confirmDialog({
      confirm: t().dialog.delete,
      danger: true,
      message: m.removeConfirm(record.name),
    })
      .then((ok) => (ok ? deleteCurrentWorkspace() : undefined))
      .catch((error) =>
        showToast("error", m.deleteFailed(error instanceof Error ? error.message : String(error)))
      );
  };

  return (
    <div className="ws" ref={box}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="ws-button"
        onClick={() => setOpen(!open)}
        title={isPersistent() ? m.saved : m.notSaved}
        type="button"
      >
        {!isPersistent() && <span aria-hidden="true">⚠ </span>}
        {record.name}
        <span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <div aria-label={m.menu} className="ws-menu" role="menu">
          {list.map((item) => (
            <button
              aria-checked={item.id === record.id}
              className="ws-item"
              key={item.id}
              onClick={() => {
                setOpen(false);
                if (item.id !== record.id) switchWorkspace(item.id);
              }}
              role="menuitemradio"
              type="button"
            >
              {item.id === record.id ? "✓ " : ""}
              {item.id === record.id ? record.name : item.name}
            </button>
          ))}
          <hr className="ws-line" />
          <button className="ws-item" onClick={create} role="menuitem" type="button">
            {m.create}
          </button>
          <button
            className="ws-item"
            onClick={() => {
              setOpen(false);
              fileInput.current?.click();
            }}
            role="menuitem"
            type="button"
          >
            {m.importZip}
          </button>
          <button className="ws-item" onClick={rename} role="menuitem" type="button">
            {m.rename}
          </button>
          <button className="ws-item" onClick={remove} role="menuitem" type="button">
            {m.remove}
          </button>
          {!isPersistent() && <p className="ws-note">{m.notSaved}</p>}
        </div>
      )}
      <input
        accept=".zip,application/zip"
        className="ws-file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) importZip(file);
        }}
        ref={fileInput}
        type="file"
      />
    </div>
  );
};

/** 保存出了问题时，顶上显示一条说明和能做的事 */
export const SaveBanner = () => {
  const m = useMessages().workspace;
  const status = useSyncExternalStore(subscribeRecord, saveStatus);
  if (status.kind === "ok" || status.kind === "memory") return null;
  return (
    <div className="ws-banner" role="alert">
      <span>
        {status.kind === "error"
          ? m.saveError(status.message)
          : status.kind === "conflict"
            ? m.conflict
            : m.deleted}
      </span>
      {status.kind === "error" ? (
        <button className="ws-banner-button" onClick={() => retrySave()} type="button">
          {m.retry}
        </button>
      ) : (
        <button className="ws-banner-button" onClick={() => window.location.reload()} type="button">
          {m.reload}
        </button>
      )}
    </div>
  );
};
