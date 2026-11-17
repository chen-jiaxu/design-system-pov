// Design Token：几套方案（tab 切换），每套按分组列出 token（颜色、尺寸、字体、时长、阴影等）。
// 正在使用的方案写成 src/tokens.css（:root 里的 CSS 变量），组件、画布都能用 var(--xxx) 引用。
// 方案本身跟着工作区存（IndexedDB）。
import {
  contrastOnWhite,
  deltaE,
  formatOklch,
  normalizeHex,
  type TextUse,
  textUse,
  toOklch,
} from "../shared/color";
import type { TokenDefinition } from "../shared/manifest";
import { t } from "./i18n";
import { tokenKind } from "./token-groups";
import { createWorkspaceStore } from "./workspace-store";

/** 写全局变量的文件。组件的样式、生成的页面都 import 它 */
export const TOKEN_FILE = "src/tokens.css";

export const TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "shadow",
  "number",
  "other",
] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export interface DesignToken {
  id: string;
  /** 给人看的名字，如"主色" */
  name: string;
  /** CSS 变量名，如 --brand-600 */
  token: string;
  type: TokenType;
  /** CSS 的值。引用别的 token 时是 var(--xxx) */
  value: string;
  /** 用途、说明 */
  description: string;
}

export interface TokenGroup {
  id: string;
  name: string;
  tokens: DesignToken[];
}

/** 方案走到哪一步：草稿 → 评审中 → 已批准 */
export const SCHEME_STATUSES = ["draft", "review", "approved"] as const;
export type SchemeStatus = (typeof SCHEME_STATUSES)[number];

export interface TokenScheme {
  id: string;
  name: string;
  /** 这个方案的想法、和别的方案的区别 */
  note: string;
  /** 走到哪一步。没有时看 confirmed（以前存的方案） */
  status?: SchemeStatus;
  /** 状态最后一次改的时间（毫秒） */
  statusAt?: number;
  /** 以前的写法："确定了"。现在用 status */
  confirmed?: boolean;
  groups: TokenGroup[];
}

/** 方案的状态。以前存的只有 confirmed：确定了的算已批准 */
export const schemeStatus = (scheme: TokenScheme): SchemeStatus =>
  scheme.status ?? (scheme.confirmed ? "approved" : "draft");

/** 改状态，记下时间 */
export const withStatus = (
  scheme: TokenScheme,
  status: SchemeStatus,
  now = Date.now()
): TokenScheme => {
  const { confirmed: _legacy, ...rest } = scheme;
  return { ...rest, status, statusAt: now };
};

/** 日期写成 2026-11-17（导出的文档用，不跟着系统的格式变） */
export const formatDate = (time: number) => {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** 状态的文字，有时间时带上日期：已批准（2026-11-17） */
export const statusText = (scheme: TokenScheme) => {
  const label = t().tokens.status[schemeStatus(scheme)];
  return scheme.statusAt ? `${label}（${formatDate(scheme.statusAt)}）` : label;
};

export interface TokenState {
  schemes: TokenScheme[];
  /** 正在使用的方案（写进 src/tokens.css，预览、画布都用它） */
  applied?: string;
  /** 和哪个方案比较（颜色的 ΔE） */
  reference?: string;
}

const store = createWorkspaceStore<TokenState>("designTokens", { schemes: [] });
export const useTokenState = store.use;
export const getTokenState = store.get;

// ---- 撤销、重做 ----

/** 连着改（打字等）在这么短的时间里的，算一次 */
const COALESCE_MS = 800;
const LIMIT = 100;
/** 方案以外跟着变的东西（改名时组件文件里的引用）：撤销、重做时一起做 */
export interface SideEffect {
  undo: () => void;
  redo: () => void;
}
interface Entry {
  state: TokenState;
  /** 从这个状态变到下一个状态时一起做的事 */
  effect?: SideEffect;
}
const history = { future: [] as Entry[], lastAt: 0, past: [] as Entry[] };
const historyListeners = new Set<() => void>();
let historyVersion = 0;
const historyChanged = () => {
  historyVersion++;
  for (const listener of historyListeners) listener();
};
export const subscribeTokenHistory = (listener: () => void) => {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
};
export const tokenHistoryVersion = () => historyVersion;
export const canUndoTokens = () => history.past.length > 0;
export const canRedoTokens = () => history.future.length > 0;

/** 改方案。能撤销。effect 是一起做的别的事（撤销时反过来做） */
export const setTokenState = (next: TokenState, effect?: SideEffect) => {
  const now = Date.now();
  if (effect || now - history.lastAt > COALESCE_MS || history.past.length === 0) {
    history.past.push({ effect, state: store.get() });
    if (history.past.length > LIMIT) history.past.shift();
  }
  // 带着别的事的改动不和后面的合在一起
  history.lastAt = effect ? 0 : now;
  history.future = [];
  store.set(next);
  historyChanged();
};

/** 一开始的方案（自动建的）：不能撤销到它之前 */
export const initTokenState = (next: TokenState) => {
  history.past = [];
  history.future = [];
  history.lastAt = 0;
  store.set(next);
  historyChanged();
};

export const undoTokens = () => {
  const entry = history.past.pop();
  if (!entry) return;
  history.future.push({ effect: entry.effect, state: store.get() });
  history.lastAt = 0;
  store.set(entry.state);
  entry.effect?.undo();
  historyChanged();
};

export const redoTokens = () => {
  const entry = history.future.pop();
  if (!entry) return;
  history.past.push({ effect: entry.effect, state: store.get() });
  history.lastAt = 0;
  store.set(entry.state);
  entry.effect?.redo();
  historyChanged();
};

let counter = 0;
export const newId = () =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 新 token 的初始值 */
const DEFAULT_VALUE: Record<TokenType, string> = {
  color: "#888888",
  dimension: "8px",
  duration: "150ms",
  fontFamily: "system-ui, sans-serif",
  fontWeight: "400",
  number: "1",
  other: "",
  shadow: "0 1px 3px rgb(0 0 0 / 20%)",
};

export const newToken = (type: TokenType, token = ""): DesignToken => ({
  description: "",
  id: newId(),
  name: "",
  token,
  type,
  value: DEFAULT_VALUE[type],
});

export const allTokens = (scheme: TokenScheme | undefined) =>
  scheme?.groups.flatMap((g) => g.tokens) ?? [];

export const appliedScheme = (state: TokenState) =>
  state.schemes.find((s) => s.id === state.applied) ?? state.schemes[0];

// ---- 改名 ----

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 文字里 var(--from …) 的引用换成 --to */
export const renameReferences = (text: string, from: string, to: string) =>
  text.replace(new RegExp(`var\\(\\s*${escapeRegExp(from)}(?![\\w-])`, "g"), `var(${to}`);

/**
 * 变量名从 from 改成 to：所有方案里同名的 token 一起改（方案之间只有值不同），
 * 引用它的值（var(--from)）也跟着改
 */
export const renameTokenEverywhere = (state: TokenState, from: string, to: string): TokenState => ({
  ...state,
  schemes: state.schemes.map((scheme) => ({
    ...scheme,
    groups: scheme.groups.map((group) => ({
      ...group,
      tokens: group.tokens.map((token) => ({
        ...token,
        token: token.token === from ? to : token.token,
        value: renameReferences(token.value, from, to),
      })),
    })),
  })),
});

/** 引用这个变量的 token（同一个方案里） */
export const referencesTo = (scheme: TokenScheme | undefined, name: string) =>
  allTokens(scheme).filter((token) => referenceOf(token.value) === name);

// ---- 值 ----

/** `var(--x)` 引用的变量名 */
export const referenceOf = (value: string) =>
  /^var\(\s*(--[\w-]+)\s*(,[^)]*)?\)$/.exec(value.trim())?.[1];

/** 顺着引用找到最终的值。找不到、循环引用时返回 undefined */
export const resolveToken = (value: string, tokens: DesignToken[]): string | undefined => {
  const byName = new Map(tokens.map((token) => [token.token, token.value]));
  const seen = new Set<string>();
  let current = value;
  for (let ref = referenceOf(current); ref; ref = referenceOf(current)) {
    if (seen.has(ref)) return undefined;
    seen.add(ref);
    const next = byName.get(ref);
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
};

/** CSS 变量名能用吗 */
export const isTokenName = (name: string) => /^--[A-Za-z_][\w-]*$/.test(name);

/** 写成 CSS 的值：颜色统一成大写的 #RRGGBB（读不出时原样） */
export const cleanValue = (type: TokenType, value: string) => {
  const trimmed = value.trim();
  return type === "color" && !referenceOf(trimmed) ? (normalizeHex(trimmed) ?? trimmed) : trimmed;
};

/** 按值猜种类（从 CSS 读进来、从表格粘贴时用） */
export const guessType = (name: string, value: string): TokenType => {
  const kind = tokenKind({ file: "", name, source: "root", value }, []);
  if (kind === "color") return "color";
  if (kind === "length") return "dimension";
  if (kind === "duration") return "duration";
  if (/weight/.test(name) && /^\d+$/.test(value.trim())) return "fontWeight";
  if (kind === "font") return "fontFamily";
  if (/shadow/.test(name)) return "shadow";
  if (kind === "number") return "number";
  return "other";
};

// ---- 算出来的东西 ----

export interface ColorFacts {
  oklch?: string;
  contrast?: number;
  use?: TextUse;
}

export const colorFacts = (hex: string | undefined): ColorFacts => {
  if (!hex) return {};
  const oklch = toOklch(hex);
  const contrast = contrastOnWhite(hex) ?? undefined;
  return {
    contrast,
    oklch: oklch && formatOklch(oklch),
    use: contrast === undefined ? undefined : textUse(contrast),
  };
};

const textOfUse = (use: TextUse | undefined) =>
  use === undefined
    ? ""
    : { large: t().tokens.textLarge, no: t().tokens.textNo, ok: t().tokens.textOk }[use];

/** 对比度写成 "6.87:1（可用作文字）" */
export const contrastText = (facts: ColorFacts) =>
  facts.contrast === undefined ? "—" : `${facts.contrast.toFixed(2)}:1（${textOfUse(facts.use)}）`;

/** 比较的方案里对应的 token（同一个变量名） */
export const counterpart = (token: DesignToken, scheme: TokenScheme | undefined) =>
  token.token ? allTokens(scheme).find((other) => other.token === token.token) : undefined;

/** 两个方案里同一个颜色 token 的距离 */
export const deltaText = (
  token: DesignToken,
  tokens: DesignToken[],
  other: DesignToken | undefined,
  otherTokens: DesignToken[]
) => {
  if (!other || token.type !== "color") return "—";
  const a = resolveToken(token.value, tokens);
  const b = resolveToken(other.value, otherTokens);
  const value = a && b ? deltaE(a, b) : undefined;
  return value === undefined ? "—" : value.toFixed(3);
};

// ---- 新建、复制 ----

type DefaultGroup = "brand" | "status" | "neutral" | "size" | "font" | "motion" | "other";

const groupOf = (token: DesignToken): DefaultGroup => {
  const name = token.token;
  if (token.type === "color") {
    if (/success|warning|error|danger|info|positive|negative|caution/.test(name)) return "status";
    if (/text|ink|border|surface|background|bg|canvas|gray|grey|neutral|muted|line/.test(name))
      return "neutral";
    return "brand";
  }
  if (token.type === "dimension") return "size";
  if (token.type === "fontFamily" || token.type === "fontWeight") return "font";
  if (token.type === "duration") return "motion";
  return "other";
};

const ORDER: DefaultGroup[] = ["brand", "status", "neutral", "size", "font", "motion", "other"];

const groupName = (group: DefaultGroup) => {
  const m = t().tokens;
  return {
    brand: m.groupBrand,
    font: m.groupFont,
    motion: m.groupMotion,
    neutral: m.groupNeutral,
    other: m.groupOther,
    size: m.groupSize,
    status: m.groupStatus,
  }[group];
};

/** 第一套方案：src/tokens.css 里原来定义的变量（没有时是空的几个分组） */
export const schemeFromDefinitions = (definitions: TokenDefinition[]): TokenScheme => {
  const groups = new Map<DefaultGroup, DesignToken[]>(ORDER.map((g) => [g, []]));
  for (const definition of definitions) {
    if (definition.file !== TOKEN_FILE || definition.source !== "root") continue;
    const type = guessType(definition.name, definition.value);
    const token: DesignToken = {
      description: "",
      id: newId(),
      // 名字留给人填（如"主色"）；没填时大纲里显示变量名
      name: "",
      token: definition.name,
      type,
      value: cleanValue(type, definition.value),
    };
    groups.get(groupOf(token))?.push(token);
  }
  const filled = ORDER.filter((g) => (groups.get(g)?.length ?? 0) > 0);
  return {
    groups: (filled.length > 0 ? filled : (["brand", "neutral", "size"] as DefaultGroup[])).map(
      (g) => ({ id: newId(), name: groupName(g), tokens: groups.get(g) ?? [] })
    ),
    id: newId(),
    name: t().tokens.defaultName,
    note: "",
    status: "draft",
  };
};

/** 名字和已有的方案重了时，后面加上 suffix（还重就再加数字）：案 A → 案 A（共有） → 案 A（共有）2 */
export const freeSchemeName = (name: string, taken: string[], suffix: string) => {
  if (!taken.includes(name)) return name;
  let free = `${name}${suffix}`;
  for (let n = 2; taken.includes(free); n++) free = `${name}${suffix}${n}`;
  return free;
};

/** 复制一套方案（新的 id） */
export const duplicateScheme = (scheme: TokenScheme, name: string): TokenScheme => ({
  groups: scheme.groups.map((group) => ({
    ...group,
    id: newId(),
    tokens: group.tokens.map((token) => ({ ...token, id: newId() })),
  })),
  id: newId(),
  name,
  note: scheme.note,
  // 复制出来的是新的提案，从草稿开始
  status: "draft",
});

// ---- 导出 ----

const cssComment = (text: string) => text.replace(/\*\//g, "* /");

/** :root 里的 CSS 变量。src/tokens.css 就是它 */
export const toCss = (scheme: TokenScheme): string => {
  const head = [scheme.name, scheme.note].filter(Boolean).join("：");
  const lines = [`/* ${cssComment(head)}（${t().tokens.generatedNote}） */`, ":root {"];
  for (const group of scheme.groups) {
    const valid = group.tokens.filter((token) => isTokenName(token.token) && token.value !== "");
    if (valid.length === 0) continue;
    lines.push(`  /* ${cssComment(group.name)} */`);
    for (const token of valid) {
      const note = [token.name, token.description].filter(Boolean).join("：");
      lines.push(`  ${token.token}: ${token.value};${note ? ` /* ${cssComment(note)} */` : ""}`);
    }
  }
  lines.push("}", "");
  return lines.join("\n");
};

/** Design Tokens（W3C 的格式）的种类名 */
const DTCG_TYPE: Record<TokenType, string | undefined> = {
  color: "color",
  dimension: "dimension",
  duration: "duration",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
  number: "number",
  other: undefined,
  shadow: "shadow",
};

/** 导出的 JSON 里放这个工具自己的信息（方案的状态）的键 */
export const EXTENSION_KEY = "design-system-pov";

/** Design Tokens（W3C 的格式）：分组 → token → { $type, $value, $description }。引用写成 {名字} */
export const toTokensJson = (scheme: TokenScheme): string => {
  const groups: Record<string, unknown> = {};
  for (const group of scheme.groups) {
    const tokens: Record<string, unknown> = {};
    for (const token of group.tokens) {
      const key = token.token.replace(/^--/, "") || token.name || token.id;
      const ref = referenceOf(token.value);
      tokens[key] = {
        ...(DTCG_TYPE[token.type] ? { $type: DTCG_TYPE[token.type] } : {}),
        $value: ref ? `{${ref.replace(/^--/, "")}}` : token.value,
        ...(token.name || token.description
          ? { $description: [token.name, token.description].filter(Boolean).join("：") }
          : {}),
      };
    }
    groups[group.name] = tokens;
  }
  const description = [scheme.name, scheme.note].filter(Boolean).join("：");
  // 方案的状态放在 $extensions 里（DTCG 留给工具自己用的地方）
  const extensions = {
    [EXTENSION_KEY]: {
      status: schemeStatus(scheme),
      ...(scheme.statusAt ? { statusAt: new Date(scheme.statusAt).toISOString() } : {}),
    },
  };
  return `${JSON.stringify({ ...(description ? { $description: description } : {}), $extensions: extensions, ...groups }, null, 2)}\n`;
};

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** 文档用的表格（Markdown），贴到 Confluence 等地方 */
export const toMarkdown = (scheme: TokenScheme, reference?: TokenScheme): string => {
  const c = t().tokens.columns;
  const tokens = allTokens(scheme);
  const otherTokens = allTokens(reference);
  const lines = [`# ${scheme.name}`, "", `${t().tokens.statusLabel}：${statusText(scheme)}`, ""];
  if (scheme.note) lines.push(scheme.note, "");
  for (const group of scheme.groups) {
    const colors = group.tokens.some((token) => token.type === "color");
    const head = [c.name, c.token, c.value];
    if (colors) head.push(c.oklch, c.contrast);
    head.push(c.description);
    if (reference && colors) head.push(c.delta(reference.name));
    lines.push(
      `## ${group.name}`,
      "",
      `| ${head.join(" | ")} |`,
      `| ${head.map(() => "---").join(" | ")} |`
    );
    for (const token of group.tokens) {
      const values = [
        cell(token.name),
        token.token ? `\`${token.token}\`` : "—",
        `\`${token.value}\``,
      ];
      if (colors) {
        const facts =
          token.type === "color"
            ? colorFacts(normalizeHex(resolveToken(token.value, tokens) ?? ""))
            : {};
        values.push(facts.oklch ?? "—", contrastText(facts));
      }
      values.push(cell(token.description));
      if (reference && colors) {
        values.push(deltaText(token, tokens, counterpart(token, reference), otherTokens));
      }
      lines.push(`| ${values.join(" | ")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

// ---- 从表格粘贴 ----

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
const TOKEN = /--[\w-]+/;
const SIZE = /^-?\d+(\.\d+)?(px|rem|em|%|ms|s)$/;
/** 算出来的列（OKLCH、对比度），粘贴时不当作名字、用途 */
const COMPUTED = /^[\d.\s/]+$|^\d+(\.\d+)?:1/;

/**
 * 从文档里复制的表格读出 token：每行要有颜色值（#RRGGBB）或尺寸、时长（8px、150ms）。
 * 名字是第一个文字的格子，用途是最后一个；变量名是 --xxx 的写法
 */
export const parseTable = (text: string): DesignToken[] => {
  const found: DesignToken[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .split(/\t|\|/)
      .map((c) => c.trim().replace(/^`|`$/g, "").replace(/\*\*/g, ""));
    const hex = HEX.exec(line)?.[0];
    const size = cells.find((c) => SIZE.test(c));
    const value = hex ? normalizeHex(hex) : size;
    if (!value) continue;
    const token = TOKEN.exec(line)?.[0] ?? "";
    const words = cells.filter(
      (c) => c !== "" && !HEX.test(c) && !TOKEN.test(c) && !COMPUTED.test(c) && !SIZE.test(c)
    );
    found.push({
      description: words.length > 1 ? (words.at(-1) ?? "") : "",
      id: newId(),
      name: words[0] ?? "",
      token,
      type: hex ? "color" : guessType(token, value),
      value,
    });
  }
  return found;
};
