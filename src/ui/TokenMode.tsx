// Design Token 的界面。布局和组件的界面一样：
// 左边是分组和 token 的大纲，中间是方案的 tab 和像文档一样的表格，右边改选中的 token 和方案，下面是生成的代码。
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasRequest, RenderRequest } from "../preview/protocol";
import { normalizeHex } from "../shared/color";
import type { Manifest } from "../shared/manifest";
import { byId, toTree } from "./Canvas";
import { CodeLines, CopyButton, download } from "./CodeView";
import {
  allTokens,
  appliedScheme,
  type ColorFacts,
  canRedoTokens,
  canUndoTokens,
  colorFacts,
  contrastText,
  counterpart,
  type DesignToken,
  deltaText,
  duplicateScheme,
  formatDate,
  getTokenState,
  isTokenName,
  newId,
  newToken,
  parseTable,
  redoTokens,
  referenceOf,
  referencesTo,
  renameReferences,
  renameTokenEverywhere,
  resolveToken,
  SCHEME_STATUSES,
  type SchemeStatus,
  schemeStatus,
  setTokenState,
  subscribeTokenHistory,
  TOKEN_FILE,
  TOKEN_TYPES,
  type TokenGroup,
  type TokenScheme,
  type TokenType,
  toCss,
  tokenHistoryVersion,
  toMarkdown,
  toTokensJson,
  undoTokens,
  useTokenState,
  withStatus,
} from "./design-tokens";
import { confirmDialog } from "./dialog";
import { writeFile } from "./drafts";
import { getLocale, t, useMessages } from "./i18n";
import { useMocks } from "./mocks";
import { Preview, Segments } from "./Preview";
import { Panel } from "./Properties";
import { readPage } from "./pages";
import { initialProps, toRenderRequest, toVariants } from "./prop-values";
import { componentId, findComponent, type Selection } from "./selection";
import { shareUrl } from "./share";
import { showToast } from "./toast";
import { tokenImpact } from "./token-impact";
import { fileNameOf } from "./WorkspaceMenu";
import { workspace } from "./workspace";
import { toWrappers, useEnabledProviders } from "./wrappers";

/** 选中的分组、token */
export interface TokenSelection {
  group?: string;
  token?: string;
}

// ---- 改方案 ----

const updateScheme = (id: string, change: (scheme: TokenScheme) => TokenScheme) => {
  const state = getTokenState();
  setTokenState({ ...state, schemes: state.schemes.map((s) => (s.id === id ? change(s) : s)) });
};

const updateGroup = (scheme: string, group: string, change: (group: TokenGroup) => TokenGroup) =>
  updateScheme(scheme, (s) => ({
    ...s,
    groups: s.groups.map((g) => (g.id === group ? change(g) : g)),
  }));

const updateToken = (scheme: string, token: string, change: Partial<DesignToken>) =>
  updateScheme(scheme, (s) => ({
    ...s,
    groups: s.groups.map((g) => ({
      ...g,
      tokens: g.tokens.map((t) => (t.id === token ? { ...t, ...change } : t)),
    })),
  }));

const swap = <T,>(list: T[], index: number, offset: number): T[] => {
  const target = index + offset;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
};

const findToken = (scheme: TokenScheme | undefined, id: string | undefined) => {
  for (const group of scheme?.groups ?? []) {
    const token = group.tokens.find((t) => t.id === id);
    if (token) return { group, token };
  }
  return undefined;
};

/** 工作区里会引用 CSS 变量的文件（组件的样式和代码）。tokens.css 由方案生成，不算 */
const REFERENCING_FILE = /\.(css|scss|sass|less|tsx?|jsx?)$/;

/** 工作区的组件文件里 var(--from) 改成 var(--to)。返回改了几个文件 */
const renameInFiles = (from: string, to: string) => {
  let changed = 0;
  for (const [file, text] of Object.entries(workspace?.files() ?? {})) {
    if (file === TOKEN_FILE || !REFERENCING_FILE.test(file)) continue;
    const renamed = renameReferences(text, from, to);
    if (renamed === text) continue;
    writeFile(file, renamed);
    changed++;
  }
  return changed;
};

/**
 * 改变量名：所有方案里同名的 token、引用它的值、组件的样式和代码里的 var(--旧名) 都跟着改。
 * 新名字不能用（格式不对、和别的重复）时只改这一个，不动别处
 */
const renameToken = (schemeId: string, token: DesignToken, next: string, m: TokenTexts) => {
  const to = next.trim();
  const from = token.token;
  if (to === from) return;
  const state = getTokenState();
  const scheme = state.schemes.find((s) => s.id === schemeId);
  const taken = allTokens(scheme).some((t) => t.id !== token.id && t.token === to);
  if (!isTokenName(from) || !isTokenName(to) || taken) {
    updateToken(schemeId, token.id, { token: to });
    return;
  }
  const changed = renameInFiles(from, to);
  // 撤销时组件文件里的引用也改回去
  setTokenState(renameTokenEverywhere(state, from, to), {
    redo: () => renameInFiles(from, to),
    undo: () => renameInFiles(to, from),
  });
  showToast("info", m.renamed(from, to, changed));
};

/** 删 token 前确认。有组件、别的 token 在用时列出来 */
const confirmRemove = (
  token: DesignToken,
  scheme: TokenScheme,
  manifest: Manifest | undefined,
  m: TokenTexts
) => {
  const users = [
    ...(manifest?.components.filter((c) => c.tokens.includes(token.token)).map((c) => c.name) ??
      []),
    ...referencesTo(scheme, token.token).map((t) => t.token),
  ];
  const name = token.name || token.token || "—";
  return confirmDialog({
    confirm: t().dialog.delete,
    danger: true,
    message: users.length > 0 ? m.removeConfirmUsed(name, users.join("、")) : m.removeConfirm(name),
  });
};

/** 变量名的输入：离开输入框（或按 Enter）时才改，引用它的地方一起改 */
const TokenNameInput = ({
  scheme,
  token,
  className,
  duplicate,
}: {
  scheme: TokenScheme;
  token: DesignToken;
  className: string;
  duplicate: boolean;
}) => {
  const m = useMessages().tokens;
  const [text, setText] = useState(token.token);
  useEffect(() => setText(token.token), [token.token]);
  const commit = () => renameToken(scheme.id, token, text, m);
  return (
    <input
      aria-invalid={!isTokenName(text) || duplicate}
      aria-label={m.columns.token}
      className={className}
      onBlur={commit}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
        if (event.key === "Escape") setText(token.token);
      }}
      placeholder="--name"
      spellCheck={false}
      title={duplicate ? m.duplicateName : isTokenName(text) ? m.renameHint : m.invalidName}
      value={text}
    />
  );
};

type TokenTexts = ReturnType<typeof useMessages>["tokens"];

/** 中间的表格里滚到这个分组、token */
const reveal = (id: string) =>
  requestAnimationFrame(() =>
    document.getElementById(`tk-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  );

/** 正在看（也是正在使用）的方案和比较的方案 */
const useSchemes = () => {
  const state = useTokenState();
  const scheme = appliedScheme(state);
  const reference = state.schemes.find((s) => s.id === state.reference && s.id !== scheme?.id);
  return { reference, scheme, state };
};

// ---- 预览、值的输入 ----

/** token 的样子：颜色是色块，尺寸是长条（圆角是带圆角的方块），字体是示例文字，阴影是带阴影的方块 */
const TokenPreview = ({ token, resolved }: { token: DesignToken; resolved?: string }) => {
  if (!resolved) return <span className="tk-none">—</span>;
  switch (token.type) {
    case "color":
      return <span className="tk-swatch" style={{ background: resolved }} />;
    case "dimension":
      return /radius|round/.test(token.token) ? (
        <span className="tk-radius" style={{ borderRadius: resolved }} />
      ) : (
        <span className="tk-bar" style={{ width: `min(${resolved}, 120px)` }} />
      );
    case "fontFamily":
      return <span style={{ fontFamily: resolved }}>Aa 永 あ</span>;
    case "fontWeight":
      return <span style={{ fontWeight: resolved }}>Aa 永 あ</span>;
    case "shadow":
      return <span className="tk-shadow" style={{ boxShadow: resolved }} />;
    default:
      return <span className="tk-none">—</span>;
  }
};

const UNITS: Partial<Record<TokenType, string[]>> = {
  dimension: ["px", "rem", "em", "%"],
  duration: ["ms", "s"],
};

/** 数字加单位 */
const UnitInput = ({
  type,
  value,
  onChange,
  label,
}: {
  type: TokenType;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  const units = UNITS[type] ?? [];
  const match = /^(-?[\d.]*)\s*([a-z%]*)$/i.exec(value.trim());
  const number = match?.[1] ?? "";
  const unit = match?.[2] || units[0] || "";
  return (
    <span className="tk-unit">
      <input
        aria-label={label}
        className="tk-input"
        onChange={(event) => onChange(`${event.target.value}${unit}`)}
        step="any"
        type="number"
        value={number}
      />
      <select
        aria-label={label}
        className="tk-input tk-unit-select"
        onChange={(event) => onChange(`${number}${event.target.value}`)}
        value={unit}
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </span>
  );
};

/** 颜色：取色器加 #RRGGBB。写对了才采用 */
const ColorInput = ({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  const m = useMessages().tokens;
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = normalizeHex(text) !== undefined;
  return (
    <span className="tk-color">
      <input
        aria-label={label}
        className="tk-picker"
        onChange={(event) => onChange(normalizeHex(event.target.value) ?? event.target.value)}
        type="color"
        value={(normalizeHex(value) ?? "#888888").toLowerCase()}
      />
      <input
        aria-invalid={!valid}
        aria-label={label}
        className="tk-input tk-mono"
        onBlur={() => setText(value)}
        onChange={(event) => {
          setText(event.target.value);
          const hex = normalizeHex(event.target.value);
          if (hex) onChange(hex);
        }}
        spellCheck={false}
        title={valid ? undefined : m.invalidHex}
        value={text}
      />
    </span>
  );
};

const WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

/** 值的输入：可以引用别的 token，也可以按种类直接写 */
const ValueInput = ({
  token,
  tokens,
  onChange,
}: {
  token: DesignToken;
  tokens: DesignToken[];
  onChange: (value: string) => void;
}) => {
  const m = useMessages().tokens;
  const ref = referenceOf(token.value);
  const candidates = tokens.filter(
    (other) => other.id !== token.id && isTokenName(other.token) && other.type === token.type
  );
  const label = m.columns.value;
  let direct: ReactNode;
  if (token.type === "color") {
    direct = <ColorInput label={label} onChange={onChange} value={token.value} />;
  } else if (token.type === "dimension" || token.type === "duration") {
    direct = <UnitInput label={label} onChange={onChange} type={token.type} value={token.value} />;
  } else if (token.type === "fontWeight") {
    direct = (
      <select
        aria-label={label}
        className="tk-input"
        onChange={(event) => onChange(event.target.value)}
        value={WEIGHTS.includes(token.value) ? token.value : "400"}
      >
        {WEIGHTS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    );
  } else if (token.type === "number") {
    direct = (
      <input
        aria-label={label}
        className="tk-input"
        onChange={(event) => onChange(event.target.value)}
        step="any"
        type="number"
        value={token.value}
      />
    );
  } else {
    direct = (
      <input
        aria-label={label}
        className="tk-input tk-mono"
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={token.value}
      />
    );
  }
  return (
    <div className="tk-value">
      <select
        aria-label={m.refLabel}
        className="tk-input"
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? (resolveToken(token.value, tokens) ?? newToken(token.type).value)
              : `var(${event.target.value})`
          )
        }
        value={ref ?? ""}
      >
        <option value="">{m.refNone}</option>
        {candidates.map((other) => (
          <option key={other.id} value={other.token}>
            {m.refOption(other.token, other.name)}
          </option>
        ))}
      </select>
      {ref === undefined && direct}
    </div>
  );
};

// ---- 左边：大纲 ----

export const TokenOutliner = ({
  selection,
  onSelect,
}: {
  selection: TokenSelection;
  onSelect: (selection: TokenSelection) => void;
}) => {
  const m = useMessages().tokens;
  const { scheme } = useSchemes();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  if (!scheme) return null;

  const addGroup = () => {
    const group: TokenGroup = { id: newId(), name: m.newGroup, tokens: [] };
    updateScheme(scheme.id, (s) => ({ ...s, groups: [...s.groups, group] }));
    onSelect({ group: group.id });
    reveal(group.id);
  };
  const addToken = (group: TokenGroup) => {
    const type = group.tokens.at(-1)?.type ?? "color";
    const token = newToken(type);
    updateGroup(scheme.id, group.id, (g) => ({ ...g, tokens: [...g.tokens, token] }));
    onSelect({ group: group.id, token: token.id });
    reveal(token.id);
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: 和组件的大纲一样，键盘操作以后再做
    <ul className="ol-tree" role="tree">
      {scheme.groups.map((group) => {
        const open = !closed.has(group.id);
        return (
          // biome-ignore lint/a11y/useFocusableInteractive: 和组件的大纲一样，键盘操作以后再做
          <li aria-expanded={open} className="ol-group" key={group.id} role="treeitem">
            <button
              aria-pressed={selection.group === group.id && !selection.token}
              className="ol-branch"
              onClick={() => {
                setClosed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.id) && selection.group === group.id) next.delete(group.id);
                  else if (selection.group === group.id) next.add(group.id);
                  return next;
                });
                onSelect({ group: group.id });
                reveal(group.id);
              }}
              type="button"
            >
              <span aria-hidden="true" className="ol-caret">
                {open ? "▾" : "▸"}
              </span>
              {group.name || "—"}
              <span className="ol-count">{group.tokens.length}</span>
            </button>
            <button
              aria-label={m.addToken}
              className="ol-add"
              onClick={() => addToken(group)}
              title={m.addToken}
              type="button"
            >
              +
            </button>
            {open && (
              // biome-ignore lint/a11y/useSemanticElements: tree 中的 group，不是 fieldset
              <ul role="group">
                {group.tokens.length === 0 && <li className="ol-empty">{m.emptyGroup}</li>}
                {group.tokens.map((token) => (
                  <li key={token.id} role="none">
                    <button
                      aria-selected={selection.token === token.id}
                      className="ol-leaf"
                      onClick={() => {
                        onSelect({ group: group.id, token: token.id });
                        reveal(token.id);
                      }}
                      role="treeitem"
                      title={token.token}
                      type="button"
                    >
                      {token.name || token.token || "—"}
                      <span className="ol-note">{m.types[token.type]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      <li className="tk-outliner-add" role="none">
        <button className="ol-branch" onClick={addGroup} type="button">
          + {m.addGroup}
        </button>
      </li>
    </ul>
  );
};

// ---- 中间：方案的 tab 和表格 ----

const GroupTable = ({
  scheme,
  group,
  index,
  reference,
  selection,
  onSelect,
  manifest,
}: {
  manifest: Manifest | undefined;
  scheme: TokenScheme;
  group: TokenGroup;
  index: number;
  reference: TokenScheme | undefined;
  selection: TokenSelection;
  onSelect: (selection: TokenSelection) => void;
}) => {
  const m = useMessages().tokens;
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const tokens = allTokens(scheme);
  const otherTokens = allTokens(reference);
  const colors = group.tokens.some((t) => t.type === "color");

  const addPasted = () => {
    const found = parseTable(pasted);
    if (found.length === 0) {
      showToast("error", m.pasteNone);
      return;
    }
    updateGroup(scheme.id, group.id, (g) => ({ ...g, tokens: [...g.tokens, ...found] }));
    showToast("info", m.pasted(found.length));
    setPasted("");
    setPasting(false);
  };

  return (
    <section
      className="pv-group"
      data-selected={selection.group === group.id}
      id={`tk-${group.id}`}
    >
      <div className="pv-group-head">
        <input
          aria-label={m.groupName}
          className="pv-group-name"
          onChange={(event) =>
            updateGroup(scheme.id, group.id, (g) => ({ ...g, name: event.target.value }))
          }
          value={group.name}
        />
        <span className="pv-spacer" />
        <button
          className="pv-button"
          disabled={index === 0}
          onClick={() =>
            updateScheme(scheme.id, (s) => ({ ...s, groups: swap(s.groups, index, -1) }))
          }
          type="button"
        >
          {m.moveUp}
        </button>
        <button
          className="pv-button"
          disabled={index === scheme.groups.length - 1}
          onClick={() =>
            updateScheme(scheme.id, (s) => ({ ...s, groups: swap(s.groups, index, 1) }))
          }
          type="button"
        >
          {m.moveDown}
        </button>
        <button
          className="pv-button"
          onClick={async () => {
            if (
              await confirmDialog({
                confirm: t().dialog.delete,
                danger: true,
                message: m.removeGroupConfirm(group.name),
              })
            )
              updateScheme(scheme.id, (s) => ({
                ...s,
                groups: s.groups.filter((g) => g.id !== group.id),
              }));
          }}
          type="button"
        >
          {m.removeGroup}
        </button>
      </div>
      <div className="pv-table-wrap">
        <table className="pv-table">
          <thead>
            <tr>
              <th className="tk-col-preview">{m.columns.preview}</th>
              <th>{m.columns.name}</th>
              <th>{m.columns.token}</th>
              <th>{m.columns.type}</th>
              <th className="tk-col-value">{m.columns.value}</th>
              {colors && <th>{m.columns.oklch}</th>}
              {colors && <th>{m.columns.contrast}</th>}
              <th className="pv-col-usage">{m.columns.description}</th>
              {colors && reference && <th>{m.columns.delta(reference.name)}</th>}
              <th className="pv-col-actions" />
            </tr>
          </thead>
          <tbody>
            {group.tokens.length === 0 && (
              <tr>
                <td className="tk-empty-row" colSpan={10}>
                  {m.emptyGroup}
                </td>
              </tr>
            )}
            {group.tokens.map((token, row) => {
              const resolved = resolveToken(token.value, tokens);
              const facts: ColorFacts =
                token.type === "color" ? colorFacts(normalizeHex(resolved ?? "")) : {};
              const duplicate =
                token.token !== "" &&
                tokens.some((o) => o.id !== token.id && o.token === token.token);
              return (
                <tr
                  aria-selected={selection.token === token.id}
                  className="tk-row"
                  id={`tk-${token.id}`}
                  key={token.id}
                  onFocusCapture={() => onSelect({ group: group.id, token: token.id })}
                  onPointerDown={() => onSelect({ group: group.id, token: token.id })}
                >
                  <td className="tk-col-preview">
                    <TokenPreview resolved={resolved} token={token} />
                  </td>
                  <td>
                    <input
                      aria-label={m.columns.name}
                      className="pv-cell"
                      onChange={(event) =>
                        updateToken(scheme.id, token.id, { name: event.target.value })
                      }
                      value={token.name}
                    />
                  </td>
                  <td>
                    <TokenNameInput
                      className="pv-cell pv-mono"
                      duplicate={duplicate}
                      scheme={scheme}
                      token={token}
                    />
                  </td>
                  <td className="pv-fact">{m.types[token.type]}</td>
                  <td className="tk-col-value">
                    <input
                      aria-label={m.columns.value}
                      className="pv-cell pv-mono"
                      onChange={(event) =>
                        updateToken(scheme.id, token.id, { value: event.target.value })
                      }
                      spellCheck={false}
                      title={resolved === undefined ? m.refBroken : undefined}
                      value={token.value}
                    />
                  </td>
                  {colors && <td className="pv-mono pv-fact">{facts.oklch ?? "—"}</td>}
                  {colors && (
                    <td className="pv-fact" data-use={facts.use}>
                      {token.type === "color" ? contrastText(facts) : "—"}
                    </td>
                  )}
                  <td className="pv-col-usage">
                    <input
                      aria-label={m.columns.description}
                      className="pv-cell"
                      onChange={(event) =>
                        updateToken(scheme.id, token.id, { description: event.target.value })
                      }
                      value={token.description}
                    />
                  </td>
                  {colors && reference && (
                    <td className="pv-mono pv-fact">
                      {deltaText(token, tokens, counterpart(token, reference), otherTokens)}
                    </td>
                  )}
                  <td className="pv-col-actions">
                    <button
                      aria-label={m.moveUp}
                      className="pv-icon"
                      disabled={row === 0}
                      onClick={() =>
                        updateGroup(scheme.id, group.id, (g) => ({
                          ...g,
                          tokens: swap(g.tokens, row, -1),
                        }))
                      }
                      title={m.moveUp}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={m.moveDown}
                      className="pv-icon"
                      disabled={row === group.tokens.length - 1}
                      onClick={() =>
                        updateGroup(scheme.id, group.id, (g) => ({
                          ...g,
                          tokens: swap(g.tokens, row, 1),
                        }))
                      }
                      title={m.moveDown}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={m.remove}
                      className="pv-icon"
                      onClick={async () => {
                        if (!(await confirmRemove(token, scheme, manifest, m))) return;
                        updateGroup(scheme.id, group.id, (g) => ({
                          ...g,
                          tokens: g.tokens.filter((t) => t.id !== token.id),
                        }));
                      }}
                      title={m.remove}
                      type="button"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pv-group-foot">
        <select
          aria-label={m.addToken}
          className="pv-select"
          onChange={(event) => {
            if (!event.target.value) return;
            const token = newToken(event.target.value as TokenType);
            updateGroup(scheme.id, group.id, (g) => ({ ...g, tokens: [...g.tokens, token] }));
            onSelect({ group: group.id, token: token.id });
            event.target.value = "";
          }}
          value=""
        >
          <option value="">+ {m.addToken}</option>
          {TOKEN_TYPES.map((type) => (
            <option key={type} value={type}>
              {m.types[type]}
            </option>
          ))}
        </select>
        <button className="pv-button" onClick={() => setPasting(!pasting)} type="button">
          {m.paste}
        </button>
      </div>
      {pasting && (
        <div className="pv-paste">
          <textarea
            aria-label={m.paste}
            // biome-ignore lint/a11y/noAutofocus: 点了"从表格粘贴"以后马上要粘贴
            autoFocus
            className="pv-paste-input"
            onChange={(event) => setPasted(event.target.value)}
            placeholder={m.pastePlaceholder}
            rows={6}
            value={pasted}
          />
          <button className="pv-button pv-primary" onClick={addPasted} type="button">
            {m.pasteAdd}
          </button>
        </div>
      )}
    </section>
  );
};

/** 方案的状态（评审中、已批准）。草稿不显示 */
const StatusBadge = ({ scheme }: { scheme: TokenScheme }) => {
  const m = useMessages().tokens;
  const status = schemeStatus(scheme);
  if (status === "draft") return null;
  return (
    <span className="tk-status" data-status={status}>
      {m.status[status]}
    </span>
  );
};

/** 中间区域标题栏里的方案 tab。点哪个就用哪个（预览、画布跟着变） */
export const SchemeTabs = () => {
  const m = useMessages().tokens;
  const { scheme, state } = useSchemes();
  const add = () => {
    if (!scheme) return;
    const copy = duplicateScheme(scheme, m.copyName(scheme.name));
    // 新方案默认和原来的比较
    setTokenState({ applied: copy.id, reference: scheme.id, schemes: [...state.schemes, copy] });
  };
  return (
    <div aria-label={m.tabs} className="tk-tabs" role="tablist">
      {state.schemes.map((s) => (
        <button
          aria-selected={s.id === scheme?.id}
          className="tk-tab"
          key={s.id}
          onClick={() => setTokenState({ ...getTokenState(), applied: s.id })}
          role="tab"
          title={s.id === scheme?.id ? m.appliedHint : m.applyHint}
          type="button"
        >
          {s.id === scheme?.id && <span className="tk-in-use">{m.inUse}</span>}
          <StatusBadge scheme={s} />
          {s.name || "—"}
        </button>
      ))}
      <button className="tk-tab tk-tab-add" onClick={add} title={m.addSchemeHint} type="button">
        + {m.addScheme}
      </button>
    </div>
  );
};

/** 撤销、重做（Design Token 的方案） */
export const TokenHistoryButtons = () => {
  const m = useMessages().app;
  useSyncExternalStore(subscribeTokenHistory, tokenHistoryVersion);
  return (
    <span className="bl-history">
      <button
        aria-label={m.undo}
        className="bl-icon-button"
        disabled={!canUndoTokens()}
        onClick={undoTokens}
        title={`${m.undo}（${m.undoKey}）`}
        type="button"
      >
        ↶
      </button>
      <button
        aria-label={m.redo}
        className="bl-icon-button"
        disabled={!canRedoTokens()}
        onClick={redoTokens}
        title={`${m.redo}（${m.redoKey}）`}
        type="button"
      >
        ↷
      </button>
    </span>
  );
};

export const TokenSheet = ({
  selection,
  onSelect,
  manifest,
}: {
  manifest: Manifest | undefined;
  selection: TokenSelection;
  onSelect: (selection: TokenSelection) => void;
}) => {
  const m = useMessages().tokens;
  const { scheme, reference } = useSchemes();
  if (!scheme) return <p className="vp-placeholder">{m.loading}</p>;
  return (
    <div className="pv tk-sheet">
      <article className="pv-doc">
        <header className="pv-head">
          <h1 className="tk-title">{scheme.name}</h1>
          {scheme.note && <p className="tk-note">{scheme.note}</p>}
          <p className="pv-legend">{m.legend}</p>
        </header>
        {scheme.groups.map((group, index) => (
          <GroupTable
            group={group}
            manifest={manifest}
            index={index}
            key={group.id}
            onSelect={onSelect}
            reference={reference}
            scheme={scheme}
            selection={selection}
          />
        ))}
      </article>
    </div>
  );
};

// ---- 右边：选中的 token、方案 ----

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="pp-row" data-wide>
    <span>{label}</span>
    <div className="pp-value">{children}</div>
  </div>
);

const ImpactRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="tk-impact-row">
    <span className="tk-impact-label">{label}</span>
    <span className="tk-impact-items">{children}</span>
  </div>
);

const TokenPanel = ({
  scheme,
  reference,
  manifest,
  pages,
  selection,
  onSelect,
  onOpen,
}: {
  scheme: TokenScheme;
  reference: TokenScheme | undefined;
  manifest: Manifest | undefined;
  pages: string[];
  selection: TokenSelection;
  onSelect: (selection: TokenSelection) => void;
  /** 打开组件、页面（换到组件的界面） */
  onOpen: (selection: Selection) => void;
}) => {
  const m = useMessages().tokens;
  const found = findToken(scheme, selection.token);
  if (!found) {
    return (
      <Panel title={m.tokenTitle}>
        <p className="pp-mute">{m.noSelection}</p>
      </Panel>
    );
  }
  const { token, group } = found;
  const tokens = allTokens(scheme);
  const resolved = resolveToken(token.value, tokens);
  const duplicate =
    token.token !== "" && tokens.some((o) => o.id !== token.id && o.token === token.token);
  const facts = token.type === "color" ? colorFacts(normalizeHex(resolved ?? "")) : undefined;
  const other = counterpart(token, reference);
  const impact = tokenImpact(
    token.token,
    scheme,
    manifest,
    pages.map((name) => ({ name, page: readPage(name) }))
  );
  const set = (change: Partial<DesignToken>) => updateToken(scheme.id, token.id, change);
  const rem = token.type === "dimension" && /^-?[\d.]+rem$/.test(resolved ?? "");

  return (
    <Panel title={m.tokenTitle}>
      <Field label={m.columns.name}>
        <input
          className="pp-input"
          onChange={(e) => set({ name: e.target.value })}
          value={token.name}
        />
      </Field>
      <Field label={m.columns.token}>
        <TokenNameInput
          className="pp-input tk-mono"
          duplicate={duplicate}
          scheme={scheme}
          token={token}
        />
        {!isTokenName(token.token) && <span className="tk-warn">{m.invalidName}</span>}
        {duplicate && <span className="tk-warn">{m.duplicateName}</span>}
      </Field>
      <Field label={m.columns.type}>
        <select
          className="pp-input"
          onChange={(e) => {
            const type = e.target.value as TokenType;
            set({ type, value: newToken(type).value });
          }}
          value={token.type}
        >
          {TOKEN_TYPES.map((type) => (
            <option key={type} value={type}>
              {m.types[type]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={m.columns.value}>
        <ValueInput onChange={(value) => set({ value })} token={token} tokens={tokens} />
        <span className="tk-resolved">
          <TokenPreview resolved={resolved} token={token} />
          {resolved === undefined
            ? m.refBroken
            : referenceOf(token.value)
              ? m.resolved(resolved)
              : ""}
          {rem && resolved ? ` ${m.pxEquivalent(Number.parseFloat(resolved) * 16)}` : ""}
        </span>
      </Field>
      {facts && (
        <>
          <Field label={m.columns.oklch}>
            <code>{facts.oklch ?? "—"}</code>
          </Field>
          <Field label={m.columns.contrast}>
            <span className="tk-fact" data-use={facts.use}>
              {contrastText(facts)}
            </span>
          </Field>
          {reference && (
            <Field label={m.columns.delta(reference.name)}>
              <code>{deltaText(token, tokens, other, allTokens(reference))}</code>
            </Field>
          )}
        </>
      )}
      <Field label={m.columns.description}>
        <textarea
          className="pp-input tk-textarea"
          onChange={(e) => set({ description: e.target.value })}
          rows={3}
          value={token.description}
        />
      </Field>
      <Field label={m.impact}>
        {impact.tokens.length + impact.components.length + impact.pages.length === 0 ? (
          <span className="pp-mute">{m.impactNone}</span>
        ) : (
          <div className="tk-impact">
            {impact.tokens.length > 0 && (
              <ImpactRow label={m.impactTokens}>
                {impact.tokens.map((t) => (
                  <button
                    className="tk-impact-link tk-mono"
                    key={t.id}
                    onClick={() =>
                      onSelect({ group: findToken(scheme, t.id)?.group.id, token: t.id })
                    }
                    title={m.impactOpen(t.token)}
                    type="button"
                  >
                    {t.token}
                  </button>
                ))}
              </ImpactRow>
            )}
            {impact.components.length > 0 && (
              <ImpactRow label={m.impactComponents}>
                {impact.components.map((c) => (
                  <button
                    className="tk-impact-link"
                    key={componentId(c)}
                    onClick={() => onOpen({ id: componentId(c), kind: "component" })}
                    title={m.impactOpen(c.name)}
                    type="button"
                  >
                    {c.name}
                  </button>
                ))}
              </ImpactRow>
            )}
            {impact.pages.length > 0 && (
              <ImpactRow label={m.impactPages}>
                {impact.pages.map((name) => (
                  <button
                    className="tk-impact-link"
                    key={name}
                    onClick={() => onOpen({ kind: "page", name })}
                    title={m.impactOpen(name)}
                    type="button"
                  >
                    {name}
                  </button>
                ))}
              </ImpactRow>
            )}
          </div>
        )}
      </Field>
      <button
        className="pp-button"
        onClick={async () => {
          if (!(await confirmRemove(token, scheme, manifest, m))) return;
          updateGroup(scheme.id, group.id, (g) => ({
            ...g,
            tokens: g.tokens.filter((t) => t.id !== token.id),
          }));
          onSelect({ group: group.id });
        }}
        type="button"
      >
        {m.remove}
      </button>
    </Panel>
  );
};

const SchemePanel = ({ scheme, reference }: { scheme: TokenScheme; reference?: TokenScheme }) => {
  const m = useMessages().tokens;
  const state = useTokenState();
  return (
    <Panel title={m.schemeTitle}>
      <p className="pp-mute">{m.global(TOKEN_FILE)}</p>
      <Field label={m.schemeName}>
        <input
          className="pp-input"
          onChange={(e) => updateScheme(scheme.id, (s) => ({ ...s, name: e.target.value }))}
          value={scheme.name}
        />
      </Field>
      <Field label={m.note}>
        <textarea
          className="pp-input tk-textarea"
          onChange={(e) => updateScheme(scheme.id, (s) => ({ ...s, note: e.target.value }))}
          placeholder={m.notePlaceholder}
          rows={3}
          value={scheme.note}
        />
      </Field>
      <Field label={m.statusLabel}>
        <span title={m.statusHint}>
          <Segments
            label={m.statusLabel}
            onChange={(status: SchemeStatus) =>
              updateScheme(scheme.id, (s) => withStatus(s, status))
            }
            options={SCHEME_STATUSES.map((status) => [status, m.status[status]] as const)}
            value={schemeStatus(scheme)}
          />
        </span>
        {scheme.statusAt && (
          <span className="pp-mute tk-status-at">{m.statusAt(formatDate(scheme.statusAt))}</span>
        )}
      </Field>
      <Field label={m.reference}>
        <select
          className="pp-input"
          onChange={(e) =>
            setTokenState({ ...getTokenState(), reference: e.target.value || undefined })
          }
          value={reference?.id ?? ""}
        >
          <option value="">{m.noReference}</option>
          {state.schemes
            .filter((s) => s.id !== scheme.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <div className="cs-actions">
        <button
          className="pp-button"
          onClick={() =>
            shareUrl(scheme)
              .then((url) => navigator.clipboard.writeText(url).then(() => url))
              .then((url) => showToast("info", m.shareCopied(url.length)))
              .catch((error) => showToast("error", String(error)))
          }
          title={m.shareHint}
          type="button"
        >
          {m.share}
        </button>
        <button
          className="pp-button"
          onClick={() => {
            const copy = duplicateScheme(scheme, m.copyName(scheme.name));
            setTokenState({
              applied: copy.id,
              reference: scheme.id,
              schemes: [...state.schemes, copy],
            });
          }}
          type="button"
        >
          {m.duplicate}
        </button>
        <button
          className="pp-button"
          disabled={state.schemes.length <= 1}
          onClick={async () => {
            if (
              !(await confirmDialog({
                confirm: t().dialog.delete,
                danger: true,
                message: m.removeSchemeConfirm(scheme.name),
              }))
            )
              return;
            const rest = state.schemes.filter((s) => s.id !== scheme.id);
            setTokenState({
              applied: rest[0]?.id,
              reference: state.reference === scheme.id ? undefined : state.reference,
              schemes: rest,
            });
          }}
          title={state.schemes.length <= 1 ? m.removeLast : undefined}
          type="button"
        >
          {m.removeScheme}
        </button>
      </div>
    </Panel>
  );
};

export const TokenPanels = ({
  manifest,
  pages,
  selection,
  onSelect,
  onOpen,
}: {
  manifest: Manifest | undefined;
  pages: string[];
  selection: TokenSelection;
  onSelect: (selection: TokenSelection) => void;
  onOpen: (selection: Selection) => void;
}) => {
  const { scheme, reference } = useSchemes();
  if (!scheme) return null;
  return (
    <>
      <TokenPanel
        manifest={manifest}
        onOpen={onOpen}
        onSelect={onSelect}
        pages={pages}
        reference={reference}
        scheme={scheme}
        selection={selection}
      />
      <SchemePanel reference={reference} scheme={scheme} />
    </>
  );
};

// ---- 下面：生成的代码 ----

type CodeKind = "css" | "json" | "markdown";

export const TokenCode = () => {
  const m = useMessages();
  const { scheme, reference } = useSchemes();
  const [kind, setKind] = useState<CodeKind>("css");
  if (!scheme) return null;
  const text =
    kind === "css"
      ? toCss(scheme)
      : kind === "json"
        ? toTokensJson(scheme)
        : toMarkdown(scheme, reference);
  const name =
    kind === "css"
      ? (TOKEN_FILE.split("/").at(-1) ?? "tokens.css")
      : `${fileNameOf(scheme.name)}.${kind === "json" ? "tokens.json" : "md"}`;
  return (
    <div className="cv">
      <div className="cv-tabs">
        <Segments
          label={m.tokens.codeLabel}
          onChange={setKind}
          options={[
            ["css", "CSS"],
            ["json", "JSON"],
            ["markdown", "Markdown"],
          ]}
          value={kind}
        />
        <span
          className="cs-code-title"
          title={kind === "css" ? m.tokens.global(TOKEN_FILE) : undefined}
        >
          {kind === "css" ? TOKEN_FILE : name}
        </span>
        <span className="cv-spacer" />
        <button className="cv-copy" onClick={() => download(name, text)} type="button">
          {m.code.download}
        </button>
        <CopyButton text={text} />
      </div>
      <div className="cv-body">
        <CodeLines language={kind === "css" ? "css" : "tsx"} text={text} />
      </div>
    </div>
  );
};

// ---- 中间：并排比较 ----

/** 每个方案各放一个预览，看同一个组件或页面在不同方案下的样子 */
export const TokenCompare = ({
  manifest,
  pages,
}: {
  manifest: Manifest | undefined;
  pages: string[];
}) => {
  const m = useMessages().tokens;
  const { scheme: applied, state } = useSchemes();
  const mocks = useMocks();
  const enabled = useEnabledProviders();
  const components = manifest?.components.filter((c) => !c.unavailable) ?? [];
  const targets = [
    ...pages.map((name) => ({ id: `page:${name}`, label: m.comparePage(name) })),
    ...components.map((c) => ({ id: `component:${componentId(c)}`, label: c.name })),
  ];
  const [chosen, setChosen] = useState<string>();
  const target = targets.find((t) => t.id === chosen) ?? targets[0];
  if (!manifest || !target) return <p className="vp-placeholder">{m.compareEmpty}</p>;

  const wrappers = toWrappers(manifest.providers, enabled, mocks);
  const requestFor = (scheme: TokenScheme): RenderRequest | CanvasRequest | undefined => {
    const tokenCss = toCss(scheme);
    if (target.id.startsWith("page:")) {
      const page = readPage(target.id.slice("page:".length));
      return {
        locale: getLocale(),
        nodes: toTree(page.nodes, byId(manifest), mocks),
        tokenCss,
        type: "dsp:canvas",
        wrappers,
      };
    }
    const component = findComponent(manifest, target.id.slice("component:".length));
    // 组件排出所有变体：一次看到各种状态在这套方案下的样子
    return component
      ? {
          ...toRenderRequest(component, initialProps(component), mocks, wrappers),
          locale: getLocale(),
          tokenCss,
          variants: toVariants(component, initialProps(component), mocks),
        }
      : undefined;
  };

  return (
    <div className="tk-compare">
      <div className="tk-compare-head">
        <label className="tk-compare-label">
          {m.compareTarget}
          <select
            className="pv-select"
            onChange={(event) => setChosen(event.target.value)}
            value={target.id}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <span className="pp-mute">{m.compareHint}</span>
      </div>
      <div className="tk-compare-grid">
        {state.schemes.map((scheme) => {
          const request = requestFor(scheme);
          return (
            <section className="tk-compare-cell" key={scheme.id}>
              <header className="tk-compare-cell-head">
                <strong>{scheme.name || "—"}</strong>
                {scheme.id === applied?.id && <span className="tk-in-use">{m.inUse}</span>}
                <StatusBadge scheme={scheme} />
              </header>
              <div className="tk-compare-frame">{request && <Preview request={request} />}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
