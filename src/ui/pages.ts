// 画布的页面：存成工作区里的两个文件，src/pages/名字.canvas.json（结构）和 src/pages/名字.tsx（生成的代码）。
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { Manifest } from "../shared/manifest";
import { starterFiles } from "../workspace/template";
import { allNodes, type CanvasPage, emptyPage, parsePage, serializePage } from "./canvas-tree";
import { createFile, discardFile, writeFile } from "./drafts";
import { t } from "./i18n";
import type { Mocks } from "./mocks";
import { pageFiles, pageNameOf, toPageCode } from "./page-code";
import { registerFlush } from "./session";
import { workspace } from "./workspace";

const noop = () => () => {};

/** 现在的文件内容（改过的优先） */
const currentText = (file: string) => workspace?.getDraft(file) ?? workspace?.original(file);

const listPages = (): string[] =>
  Object.keys(workspace?.files() ?? {})
    .map(pageNameOf)
    .filter((name): name is string => name !== undefined)
    .sort();

let cache: { version: number; pages: string[] } = { pages: [], version: -1 };

/** 工作区里的页面的名字 */
export const usePages = (): string[] => {
  const version = useSyncExternalStore(
    workspace?.subscribe ?? noop,
    () => workspace?.getFilesVersion() ?? 0
  );
  if (cache.version !== version) cache = { pages: listPages(), version };
  return cache.pages;
};

/** 名字不能用时返回原因。名字会成为页面组件的名字，所以和组件一样大写开头 */
export const checkPageName = (name: string, pages: string[]): string | undefined => {
  if (name === "") return t().page.nameRequired;
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return t().page.invalidName;
  if (pages.includes(name)) return t().page.exists(name);
  return undefined;
};

export const readPage = (name: string): CanvasPage => {
  const text = currentText(pageFiles(name).canvas);
  return (text && parsePage(text)) || emptyPage();
};

/** 删掉的页面。还没写进去的改动不要再把它写回来 */
const deleted = new Set<string>();

export const createPage = async (name: string, manifest: Manifest, mocks: Mocks) => {
  deleted.delete(name);
  const files = pageFiles(name);
  await writeFile(files.canvas, serializePage(emptyPage()));
  await writeFile(files.code, toPageCode(name, emptyPage(), manifest, mocks));
};

/** 模板里的示例页面（列表、表单、仪表盘） */
export const SAMPLE_PAGES: string[] = Object.keys(starterFiles)
  .map(pageNameOf)
  .filter((name): name is string => name !== undefined)
  .sort();

/** 名字重了时后面加数字：UserList → UserList2 */
export const freePageName = (name: string, pages: string[]) => {
  let free = name;
  for (let n = 2; pages.includes(free); n++) free = `${name}${n}`;
  return free;
};

/**
 * 把示例页面加进工作区，返回加进去的页面的名字。
 * 示例用到、工作区里还没有的组件（整个目录，含样式）也一起加；已经有的文件不动
 */
export const addSamplePage = async (
  sample: string,
  pages: string[],
  manifest: Manifest,
  mocks: Mocks
): Promise<string | undefined> => {
  const page = parsePage(starterFiles[pageFiles(sample).canvas] ?? "");
  if (!page) return undefined;
  const existing = workspace?.files() ?? {};
  const dirs = new Set(
    allNodes(page.nodes).map((node) => node.component.split("#")[0]?.replace(/[^/]+$/, "") ?? "")
  );
  for (const [file, text] of Object.entries(starterFiles)) {
    if (file in existing || ![...dirs].some((dir) => dir !== "" && file.startsWith(dir))) continue;
    if (!(await createFile(file, text))) return undefined;
  }
  const name = freePageName(sample, pages);
  deleted.delete(name);
  const files = pageFiles(name);
  await writeFile(files.canvas, serializePage(page));
  // 新加的组件分析完以后，打开页面时代码会按新的清单重新生成
  await writeFile(files.code, toPageCode(name, page, manifest, mocks));
  return name;
};

export const deletePage = async (name: string) => {
  deleted.add(name);
  const files = pageFiles(name);
  await discardFile(files.canvas);
  await discardFile(files.code);
};

/**
 * 编辑中的页面。改了马上反映到界面，稍后写进工作区（结构和生成的代码）。
 * 组件、Mock 数据变了时生成的代码也跟着重写
 */
export const usePage = (name: string | undefined, manifest: Manifest | undefined, mocks: Mocks) => {
  const [page, setPage] = useState<CanvasPage>(() => (name ? readPage(name) : emptyPage()));
  // 撤销、重做。换页面时清空
  const history = useRef({ future: [] as CanvasPage[], past: [] as CanvasPage[] });
  const [, setHistoryVersion] = useState(0);
  const shown = useRef(name);
  if (shown.current !== name) {
    shown.current = name;
    history.current = { future: [], past: [] };
    setPage(name ? readPage(name) : emptyPage());
  }
  const pageRef = useRef(page);
  pageRef.current = page;
  const change = (next: CanvasPage) => {
    if (next === pageRef.current) return;
    history.current.past.push(pageRef.current);
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    setPage(next);
    setHistoryVersion((v) => v + 1);
  };
  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(pageRef.current);
    setPage(previous);
    setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(pageRef.current);
    setPage(next);
    setHistoryVersion((v) => v + 1);
  };

  // 还没写进去的改动。换页面、关掉画布时马上写
  const pending = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const flush = () => {
      if (!name || !manifest) return;
      const files = pageFiles(name);
      // 页面已经删掉了：不要再写回去
      if (deleted.has(name) || currentText(files.canvas) === undefined) return;
      const structure = serializePage(page);
      const code = toPageCode(name, page, manifest, mocks);
      if (currentText(files.canvas) !== structure) writeFile(files.canvas, structure);
      if (currentText(files.code) !== code) writeFile(files.code, code);
    };
    pending.current = flush;
    const timer = setTimeout(() => {
      pending.current = undefined;
      flush();
    }, 300);
    return () => clearTimeout(timer);
  }, [name, page, manifest, mocks]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换页面时把上一个页面没写的写进去
  useEffect(
    () => () => {
      pending.current?.();
      pending.current = undefined;
    },
    [name]
  );

  // 关页面、换工作区之前马上写
  useEffect(
    () =>
      registerFlush(() => {
        pending.current?.();
        pending.current = undefined;
      }),
    []
  );

  return [
    page,
    change,
    {
      canRedo: history.current.future.length > 0,
      canUndo: history.current.past.length > 0,
      redo,
      undo,
    },
  ] as const;
};
