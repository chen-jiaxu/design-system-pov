import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { APP_NAME } from "../shared/app";
import type { ComponentInfo, Manifest } from "../shared/manifest";
import { useApplyTokens } from "./apply-tokens";
import { CanvasSheet, PageCode, PagePanels } from "./Canvas";
import { CodeView } from "./CodeView";
import { removeNode } from "./canvas-tree";
import {
  appliedScheme,
  freeSchemeName,
  getTokenState,
  redoTokens,
  setTokenState,
  undoTokens,
} from "./design-tokens";
import { chooseDialog, confirmDialog, Dialogs } from "./dialog";
import { createFile, discardAllFiles, useDraftFiles } from "./drafts";
import { downloadZip, exportFiles } from "./export";
import { LOCALES, type Locale, setLocale, t, useLocale, useMessages } from "./i18n";
import { createLocalStore } from "./local-store";
import { useManifest, useWorkspaceError } from "./manifest";
import { useMocks } from "./mocks";
import { checkComponentName, newComponentFile, newComponentSource } from "./new-component";
import { Outliner } from "./Outliner";
import { DEFAULT_PREVIEW_OPTIONS, PreviewToolbar, Segments } from "./Preview";
import { type PropChange, Properties } from "./Properties";
import {
  addSamplePage,
  checkPageName,
  createPage,
  deletePage,
  SAMPLE_PAGES,
  usePage,
  usePages,
} from "./pages";
import { initialProps, type PropValues } from "./prop-values";
import {
  componentId,
  findComponent,
  initialSelection,
  type Selection,
  stillExists,
} from "./selection";
import { currentRecord } from "./session";
import { decodeScheme, isShareHash } from "./share";
import {
  SchemeTabs,
  TokenCode,
  TokenCompare,
  TokenHistoryButtons,
  TokenOutliner,
  TokenPanels,
  type TokenSelection,
  TokenSheet,
} from "./TokenMode";
import { showToast, Toasts } from "./toast";
import { type ComponentShow, Viewport } from "./Viewport";
import { fileNameOf, SaveBanner, WorkspaceMenu } from "./WorkspaceMenu";
import { workspace } from "./workspace";

type Mode = "components" | "tokens";
/** 选的界面存在浏览器里，刷新后还是那个 */
const modeStore = createLocalStore<Mode>("mode", "components");
const useMode = (): Mode => (modeStore.use() === "tokens" ? "tokens" : "components");
const setMode = modeStore.set;

/** 下面的代码面板开着吗。默认收起（给 PdM 看时代码不是重点），选的状态存在浏览器里 */
const codeStore = createLocalStore<boolean>("codePanel", false);

/** 状态栏的高度（和 app.css 一致），算下方面板的高度时用 */
const STATUS_HEIGHT = 22;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 每条分隔线拖动时怎么算出新的大小 */
const measure = {
  bottom: (e: PointerEvent) =>
    clamp(window.innerHeight - STATUS_HEIGHT - e.clientY, 80, window.innerHeight - 200),
  left: (e: PointerEvent) => clamp(e.clientX, 180, 520),
  right: (e: PointerEvent) => clamp(window.innerWidth - e.clientX, 180, 520),
};

/** 拖动边界来调整左右宽度和下方面板的高度，和 Blender 中拖动区域边界的操作相同。 */
const startDrag =
  (side: keyof typeof measure, onResize: (size: number) => void) =>
  (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => onResize(measure[side](e));
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("lostpointercapture", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end);
  };

type View = { kind: "component"; component: ComponentInfo } | { kind: "page"; name: string };

const toView = (
  manifest: Manifest,
  selection: Selection | undefined,
  pages: string[]
): View | undefined => {
  if (!selection) return undefined;
  if (selection.kind === "page") return pages.includes(selection.name) ? selection : undefined;
  const component = findComponent(manifest, selection.id);
  return component ? { component, kind: "component" } : undefined;
};

const titleOf = (view: View | undefined) => {
  if (!view) return "";
  return view.kind === "component" ? view.component.name : view.name;
};

const breadcrumbOf = (view: View | undefined) =>
  view ? `${t().app.group[view.kind]} › ${titleOf(view)}` : "";

/** 画面窄到放不下三列（900px 以下） */
const NARROW = "(max-width: 899px)";
const useNarrow = () =>
  useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia?.(NARROW);
      query?.addEventListener("change", listener);
      return () => query?.removeEventListener("change", listener);
    },
    () => window.matchMedia?.(NARROW).matches ?? false
  );

export const App = () => {
  const manifest = useManifest();
  const m = useMessages().app;
  const failure = useWorkspaceError();
  // 还没有分析结果时显示的字：分析中，或失败的原因（等得久了的说明在下面算）
  let pending = failure ? m.analyzeFailed(failure) : m.analyzing;
  useEffect(() => {
    if (failure) showToast("error", t().app.analyzeFailed(failure));
  }, [failure]);
  const locale = useLocale();
  // 页面的语言也跟着换（读屏软件、浏览器的翻译会用到）
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  }, [locale]);
  const mocks = useMocks();
  const pages = usePages();
  // 上面切换的界面：组件（大纲、画布等）或 Design Token
  const mode = useMode();
  // 正在使用的 Design Token 方案写进 src/tokens.css（全局的 CSS 变量）
  useApplyTokens(manifest);
  const [tokenSelection, setTokenSelection] = useState<TokenSelection>({});
  // Design Token 的中间：表格，或各方案并排比较
  const [tokenView, setTokenView] = useState<"table" | "compare">("table");

  // 打开了分享的链接（#share=…）：确认后把方案加进这个工作区。等第一套方案建好以后再加
  const receivedShare = useRef(false);
  useEffect(() => {
    if (!manifest) return;
    const receive = async () => {
      if (!isShareHash(window.location.hash)) return;
      const scheme = await decodeScheme(window.location.hash);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!scheme) {
        showToast("error", t().tokens.shareBroken);
        return;
      }
      if (!(await confirmDialog({ message: t().tokens.shareConfirm(scheme.name) }))) return;
      const state = getTokenState();
      // 和已有的方案同名时加上"（共有）"，tab 上分得清
      scheme.name = freeSchemeName(
        scheme.name,
        state.schemes.map((s) => s.name),
        t().tokens.sharedSuffix
      );
      setTokenState({
        ...state,
        applied: scheme.id,
        reference: appliedScheme(state)?.id,
        schemes: [...state.schemes, scheme],
      });
      setMode("tokens");
      showToast("info", t().tokens.shareAdded(scheme.name));
    };
    if (!receivedShare.current) {
      receivedShare.current = true;
      // 第一套方案（从 src/tokens.css 建的）先建好
      setTimeout(receive, 0);
    }
    const onHash = () => {
      receive();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [manifest]);
  const [selection, setSelection] = useState<Selection>();
  const [leftWidth, setLeftWidth] = useState(240);
  // 窄的画面（900px 以下）：左右的面板收起来，按顶栏的按钮从旁边拉出来
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState<"left" | "right">();
  const toggleDrawer = (side: "left" | "right") =>
    setDrawer((open) => (open === side ? undefined : side));
  const [rightWidth, setRightWidth] = useState(340);
  // 每个组件在属性面板里填的 props。切换组件后再回来，值还在
  const [edited, setEdited] = useState<Record<string, PropValues>>({});
  // 预览的背景和宽度。换组件时保持不变
  const [previewOptions, setPreviewOptions] = useState(DEFAULT_PREVIEW_OPTIONS);
  // 组件显示一个，还是排出所有变体。换组件时保持不变
  const [componentShow, setComponentShow] = useState<ComponentShow>("single");
  // 下方代码面板的高度
  const [bottomHeight, setBottomHeight] = useState(260);

  // 刚新建的组件。分析完、它出现在清单里以后选中它
  const [created, setCreated] = useState<string>();

  // 拿到分析结果后选中第一项；文件改动后选中的东西不见了，也重新选
  useEffect(() => {
    if (!manifest) return;
    if (created && manifest.components.some((c) => componentId(c) === created)) {
      setSelection({ id: created, kind: "component" });
      setCreated(undefined);
      return;
    }
    if (!selection || !stillExists(manifest, selection, pages))
      setSelection(initialSelection(manifest));
  }, [manifest, selection, created, pages]);

  const createComponent = async (name: string) => {
    if (!manifest) return false;
    const problem = checkComponentName(name, manifest, Object.keys(workspace?.files() ?? {}));
    if (problem) {
      showToast("error", problem);
      return false;
    }
    const file = newComponentFile(name, manifest);
    if (!(await createFile(file, newComponentSource(name)))) return false;
    setCreated(`${file}#${name}`);
    showToast("info", t().app.created(name));
    return true;
  };

  const createNewPage = async (name: string) => {
    if (!manifest) return false;
    const problem = checkPageName(name, pages);
    if (problem) {
      showToast("error", problem);
      return false;
    }
    await createPage(name, manifest, mocks);
    setSelection({ kind: "page", name });
    showToast("info", t().app.pageCreated(name));
    return true;
  };

  const addSample = async () => {
    if (!manifest) return;
    const o = t().outliner;
    const sample = await chooseDialog({
      choices: SAMPLE_PAGES.map((name) => ({
        description: o.samples[name],
        label: name,
        value: name,
      })),
      message: o.chooseSample,
    });
    if (!sample) return;
    const name = await addSamplePage(sample, pages, manifest, mocks);
    if (!name) return;
    setSelection({ kind: "page", name });
    showToast("info", t().app.sampleAdded(name));
  };

  // 窄的画面：在左边选了东西以后收起面板，马上能看到中间
  // biome-ignore lint/correctness/useExhaustiveDependencies: 选中的东西变了时收起
  useEffect(() => {
    setDrawer((open) => (open === "left" ? undefined : open));
  }, [selection, tokenSelection, mode]);

  const view = manifest ? toView(manifest, selection, pages) : undefined;
  // 画布：打开的页面和上面选中的组件
  const pageName = view?.kind === "page" ? view.name : undefined;
  const [page, setPage, pageHistory] = usePage(pageName, manifest, mocks);
  const [selectedNode, setSelectedNode] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换页面时清掉选中的组件
  useEffect(() => setSelectedNode(undefined), [pageName]);
  /** 撤销、重做、删除选中的组件（画布）；Design Token 的界面是方案的撤销、重做 */
  const shortcut = (key: "undo" | "redo" | "delete") => {
    if (tokensMode) {
      if (key === "undo") undoTokens();
      if (key === "redo") redoTokens();
      return;
    }
    if (!pageName) return;
    if (key === "undo") pageHistory.undo();
    else if (key === "redo") pageHistory.redo();
    else if (selectedNode) {
      setPage(removeNode(page, selectedNode));
      setSelectedNode(undefined);
    }
  };
  const shortcutRef = useRef(shortcut);
  shortcutRef.current = shortcut;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // 在输入框里时用输入框自己的撤销
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      const action =
        mod && key === "z"
          ? event.shiftKey
            ? "redo"
            : "undo"
          : mod && key === "y"
            ? "redo"
            : !mod && (key === "delete" || key === "backspace")
              ? "delete"
              : undefined;
      if (!action) return;
      event.preventDefault();
      shortcutRef.current(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const removePage = () => {
    if (!pageName) return;
    confirmDialog({
      confirm: t().dialog.delete,
      danger: true,
      message: t().page.deletePageConfirm(pageName),
    }).then((ok) => {
      if (ok) deletePage(pageName);
    });
  };
  const tokensMode = mode === "tokens";
  const codeOpen = codeStore.use();
  const canShowCode = tokensMode || view?.kind === "component" || view?.kind === "page";
  const hasBottom = canShowCode && codeOpen;
  const codeToggle = canShowCode && (
    <button
      aria-pressed={codeOpen}
      className="bl-code-toggle"
      onClick={() => codeStore.set(!codeOpen)}
      title={m.codeHint}
      type="button"
    >
      {"</>"} {m.code}
    </button>
  );

  // 第一次打开时分析要先下载 TypeScript 等（约 1.5 MB），等得久了说明一下
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (manifest) return;
    const timer = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(timer);
  }, [manifest]);
  if (!failure && slow && !manifest) pending = m.analyzingFirst;
  /** 画布以外的显示（视口、属性面板用） */
  const sheet = view?.kind === "page" ? undefined : view;
  const editingId = view?.kind === "component" ? componentId(view.component) : undefined;
  const propValues: PropValues =
    view?.kind === "component"
      ? (edited[componentId(view.component)] ?? initialProps(view.component))
      : {};
  const changeProp: PropChange = (name, value) => {
    if (!editingId) return;
    const next = { ...propValues };
    if (value === undefined) delete next[name];
    else next[name] = value;
    setEdited({ ...edited, [editingId]: next });
  };
  const resetProps = () => {
    if (!editingId) return;
    const { [editingId]: _, ...rest } = edited;
    setEdited(rest);
  };
  const unavailable = manifest?.components.filter((c) => c.unavailable).length ?? 0;

  // 草稿：改过的文件、新建的组件。导出时工作区的全部文件和 Design Token 的方案一起打成 zip
  const drafts = useDraftFiles();
  const draftCount = Object.keys(drafts).length;
  const exportAll = () => {
    if (!manifest || !workspace) return;
    const project = currentRecord()?.name ?? manifest.root;
    const files = { ...workspace.files(), ...drafts };
    downloadZip(
      `${fileNameOf(project)}.zip`,
      exportFiles(project, files, Object.keys(drafts), getTokenState())
    );
  };
  const discardAll = () => {
    confirmDialog({ danger: true, message: m.discardAllConfirm(draftCount) }).then((ok) => {
      if (ok) discardAllFiles();
    });
  };

  return (
    <div
      className="bl"
      data-drawer={narrow ? (drawer ?? "none") : undefined}
      style={{
        gridTemplateColumns: narrow
          ? "0 0 minmax(0, 1fr) 0 0"
          : `${leftWidth}px 4px minmax(0, 1fr) 4px ${rightWidth}px`,
      }}
    >
      <header className="bl-top">
        {narrow && (
          <button
            aria-expanded={drawer === "left"}
            aria-label={m.outliner}
            className="bl-drawer-button"
            onClick={() => toggleDrawer("left")}
            title={m.outliner}
            type="button"
          >
            ☰
          </button>
        )}
        <span className="bl-brand">{APP_NAME}</span>
        <Segments
          label={m.modeLabel}
          onChange={setMode}
          options={[
            ["components", m.modeComponents],
            ["tokens", m.modeTokens],
          ]}
          value={mode}
        />
        <span className="bl-spacer" />
        <select
          aria-label={m.language}
          className="bl-language"
          onChange={(event) => setLocale(event.target.value as Locale)}
          title={m.language}
          value={locale}
        >
          {LOCALES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <WorkspaceMenu />
        {narrow && (
          <button
            aria-expanded={drawer === "right"}
            aria-label={m.properties}
            className="bl-drawer-button"
            onClick={() => toggleDrawer("right")}
            title={m.properties}
            type="button"
          >
            ⚙
          </button>
        )}
      </header>
      {narrow && drawer && (
        // biome-ignore lint/a11y/noStaticElementInteractions: 点外面关掉面板（顶栏的按钮也能关）
        // biome-ignore lint/a11y/useKeyWithClickEvents: 顶栏的按钮能用键盘关
        <div className="bl-drawer-backdrop" onClick={() => setDrawer(undefined)} />
      )}

      <aside aria-label={m.outliner} className="bl-area bl-left">
        <div className="bl-area-head">{m.outliner}</div>
        <div className="bl-scroll">
          {tokensMode ? (
            <TokenOutliner onSelect={setTokenSelection} selection={tokenSelection} />
          ) : manifest ? (
            <Outliner
              manifest={manifest}
              onAddSample={addSample}
              onCreate={(branch, name) =>
                branch === "pages" ? createNewPage(name) : createComponent(name)
              }
              onSelect={setSelection}
              pages={pages}
              selection={selection}
            />
          ) : (
            <p className="bl-placeholder">{pending}</p>
          )}
        </div>
      </aside>
      {/* biome-ignore lint/a11y/useSemanticElements: 拖动调整宽度的分隔条，<hr> 无法响应操作 */}
      <div
        aria-label={m.resizeLeft}
        aria-orientation="vertical"
        className="bl-split"
        onPointerDown={startDrag("left", setLeftWidth)}
        role="separator"
      />

      {/* 中间一列：上面是视口，下面是代码面板（拖动中间的分隔线调整高度） */}
      <div
        className="bl-center"
        style={hasBottom ? { gridTemplateRows: `minmax(0, 1fr) 4px ${bottomHeight}px` } : undefined}
      >
        <main className="bl-area">
          <div className="bl-area-head">
            {tokensMode ? (
              <>
                <SchemeTabs />
                <span className="bl-spacer" />
                <TokenHistoryButtons />
                <Segments
                  label={t().tokens.viewLabel}
                  onChange={setTokenView}
                  options={[
                    ["table", t().tokens.viewTable],
                    ["compare", t().tokens.viewCompare],
                  ]}
                  value={tokenView}
                />
                {codeToggle}
              </>
            ) : (
              <>
                <span>{titleOf(view)}</span>
                {view?.kind === "page" && (
                  <span className="bl-history">
                    <button
                      aria-label={m.undo}
                      className="bl-icon-button"
                      disabled={!pageHistory.canUndo}
                      onClick={pageHistory.undo}
                      title={`${m.undo}（${m.undoKey}）`}
                      type="button"
                    >
                      ↶
                    </button>
                    <button
                      aria-label={m.redo}
                      className="bl-icon-button"
                      disabled={!pageHistory.canRedo}
                      onClick={pageHistory.redo}
                      title={`${m.redo}（${m.redoKey}）`}
                      type="button"
                    >
                      ↷
                    </button>
                  </span>
                )}
                {view?.kind === "component" && !view.component.unavailable && (
                  <span title={t().preview.variantsHint}>
                    <Segments
                      label={t().preview.show}
                      onChange={setComponentShow}
                      options={[
                        ["single", t().preview.single],
                        ["variants", t().preview.variants],
                      ]}
                      value={componentShow}
                    />
                  </span>
                )}
                {((view?.kind === "component" && !view.component.unavailable) ||
                  view?.kind === "page") && (
                  <PreviewToolbar onChange={setPreviewOptions} options={previewOptions} />
                )}
                {codeToggle}
              </>
            )}
          </div>
          <div className="vp-frame">
            {tokensMode && tokenView === "compare" ? (
              <TokenCompare manifest={manifest} pages={pages} />
            ) : tokensMode ? (
              <TokenSheet
                manifest={manifest}
                onSelect={setTokenSelection}
                selection={tokenSelection}
              />
            ) : manifest && view?.kind === "page" ? (
              <CanvasSheet
                manifest={manifest}
                onChange={setPage}
                onKey={shortcut}
                onSelect={setSelectedNode}
                page={page}
                previewOptions={previewOptions}
                selected={selectedNode}
              />
            ) : manifest && sheet ? (
              <Viewport
                manifest={manifest}
                previewOptions={previewOptions}
                propValues={propValues}
                show={componentShow}
                view={sheet}
              />
            ) : (
              <p className="vp-placeholder">
                {manifest ? m.empty : pending}
                {failure && (
                  <>
                    {" "}
                    <button
                      className="vp-preview-reload"
                      onClick={() => workspace?.retry()}
                      type="button"
                    >
                      {t().workspace.retry}
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </main>
        {hasBottom && (
          <>
            {/* biome-ignore lint/a11y/useSemanticElements: 拖动调整高度的分隔条，<hr> 无法响应操作 */}
            <div
              aria-label={m.resizeBottom}
              aria-orientation="horizontal"
              className="bl-split bl-split-h"
              onPointerDown={startDrag("bottom", setBottomHeight)}
              role="separator"
            />
            <section aria-label={m.code} className="bl-area">
              {tokensMode ? (
                <TokenCode />
              ) : view?.kind === "component" ? (
                <CodeView component={view.component} propValues={propValues} />
              ) : manifest && view?.kind === "page" ? (
                <PageCode manifest={manifest} name={view.name} page={page} />
              ) : null}
            </section>
          </>
        )}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: 拖动调整宽度的分隔条，<hr> 无法响应操作 */}
      <div
        aria-label={m.resizeRight}
        aria-orientation="vertical"
        className="bl-split"
        onPointerDown={startDrag("right", setRightWidth)}
        role="separator"
      />
      <aside aria-label={m.properties} className="bl-area bl-right">
        <div className="bl-area-head">{m.properties}</div>
        <div className="bl-scroll">
          {tokensMode ? (
            <TokenPanels
              manifest={manifest}
              onOpen={(next) => {
                setSelection(next);
                setMode("components");
              }}
              onSelect={setTokenSelection}
              pages={pages}
              selection={tokenSelection}
            />
          ) : manifest && view?.kind === "page" ? (
            <PagePanels
              manifest={manifest}
              onChange={setPage}
              onDeletePage={removePage}
              onSelect={setSelectedNode}
              page={page}
              selected={selectedNode}
            />
          ) : manifest && sheet ? (
            <Properties
              manifest={manifest}
              onPropChange={changeProp}
              onPropReset={resetProps}
              propValues={propValues}
              view={sheet}
            />
          ) : null}
        </div>
      </aside>

      <footer className="bl-status">
        <span>{tokensMode ? m.modeTokens : breadcrumbOf(view)}</span>
        <span className="bl-spacer" />
        {manifest && (
          <span className="bl-drafts">
            {draftCount > 0 && <span title={m.draftHint}>{m.draftCount(draftCount)}</span>}
            <button
              className="bl-status-button"
              onClick={exportAll}
              title={m.exportZipHint}
              type="button"
            >
              {m.exportZip}
            </button>
            {draftCount > 0 && (
              <button className="bl-status-button" onClick={discardAll} type="button">
                {m.discardAll}
              </button>
            )}
          </span>
        )}
        {manifest ? (
          <>
            <span>{m.tokenCount(manifest.tokens.length)}</span>
            <span>{m.componentCount(manifest.components.length, unavailable)}</span>
          </>
        ) : (
          <span>{pending}</span>
        )}
      </footer>
      <SaveBanner />
      <Dialogs />
      <Toasts />
    </div>
  );
};
