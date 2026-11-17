// 给 TSX 和 CSS（包括 SCSS、Less）代码着色。不依赖库（界面要打包进安装包，加库会变大），只按词的样子粗略地分类，
// 不是完整的语法分析：够把关键字、字符串、注释、类型、JSX 标签、CSS 的选择器和属性区分开。

export type TokenKind =
  | "comment"
  | "string"
  | "number"
  /** import、return 等控制流程的关键字 */
  | "control"
  /** const、function、type 等其他关键字 */
  | "keyword"
  /** 大写开头的名字：类型、组件 */
  | "type"
  /** 后面跟着括号的名字 */
  | "function"
  /** JSX 里小写的标签名 */
  | "tag"
  /** JSX 的属性名、CSS 的属性名和变量名 */
  | "attr"
  /** CSS 的选择器 */
  | "selector"
  | "plain";

export interface Token {
  kind: TokenKind;
  text: string;
}

const CONTROL = new Set(
  "import export from default return if else for while do switch case break continue try catch finally throw await async yield".split(
    " "
  )
);
const KEYWORD = new Set(
  "const let var function class extends implements interface type enum namespace declare new typeof keyof instanceof in of as is satisfies readonly public private protected static abstract void null undefined true false this super string number boolean any unknown never object".split(
    " "
  )
);

// 依次是：注释、字符串（单双引号不跨行，反引号可以）、数字、带连字符的 JSX 属性名（data-tone=）、名字、空白、其他单个字符
const PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?)|(\d[\w.]*)|([a-z]+(?:-[a-z]+)+(?==["'{]))|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/y;

/** 标签的 > 后面、到结束标签 </ 之前的文字（按钮上的字等）。不着色 */
const JSX_TEXT = /[^<>{}();=]*(?=<\/)/y;

const classifyName = (name: string, before: string, after: string): TokenKind => {
  // 紧跟在 < 或 </ 后面的是 JSX 标签（或泛型参数，大写的都算类型）
  const isTag = /<\/?$/.test(before);
  if (isTag && /^[a-z]/.test(name)) return "tag";
  if (CONTROL.has(name)) return "control";
  if (KEYWORD.has(name)) return "keyword";
  if (/^[A-Z]/.test(name)) return "type";
  if (after.startsWith("(")) return "function";
  // name="..." 或 name={...}：中间没有空格的是 JSX 属性
  if (/^=["'{]/.test(after)) return "attr";
  return "plain";
};

/** 一行一行地收集词。跨行的词（注释、模板字符串）按行拆开 */
const createLines = () => {
  const lines: Token[][] = [[]];
  const push = (kind: TokenKind, text: string) => {
    const parts = text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part === "") return;
      const line = lines.at(-1) as Token[];
      const last = line.at(-1);
      // 相邻的同类合并，少生成一些元素
      if (last && last.kind === kind) last.text += part;
      else line.push({ kind, text: part });
    });
  };
  return { lines, push };
};

const highlightTsx = (code: string): Token[][] => {
  const { lines, push } = createLines();

  // 正在 JSX 标签里面（<Card ... 到 > 之间）
  let inTag = false;
  PATTERN.lastIndex = 0;
  let match = PATTERN.exec(code);
  while (match) {
    const [text, comment, string, number, dashedAttr, name] = match;
    if (comment) push("comment", text);
    else if (string) push("string", text);
    else if (number) push("number", text);
    else if (dashedAttr) push("attr", text);
    else if (name) {
      const before = code.slice(Math.max(0, match.index - 2), match.index);
      if (/<\/?$/.test(before)) inTag = true;
      push(classifyName(name, before, code.slice(PATTERN.lastIndex, PATTERN.lastIndex + 2)), text);
    } else {
      push("plain", text);
      // 标签结束（不是箭头函数的 =>）：后面到 </ 为止的文字原样输出
      if (text === ">" && inTag && code[match.index - 1] !== "=") {
        inTag = false;
        JSX_TEXT.lastIndex = PATTERN.lastIndex;
        const inner = JSX_TEXT.exec(code);
        if (inner?.[0]) {
          push("plain", inner[0]);
          PATTERN.lastIndex = JSX_TEXT.lastIndex;
        }
      }
    }
    match = PATTERN.exec(code);
  }
  return lines;
};

// CSS。依次是：注释、字符串、@规则、#颜色或 #id、数字（带单位）、名字（含 --变量、SCSS 的 $变量）、空白、其他单个字符。
// SCSS / Less 多一种 // 的单行注释（前面不能是冒号，免得把 url 里的 // 当成注释）
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/;
const LINE_COMMENT = /(?<!:)\/\/[^\n]*/;
const CSS_REST =
  /("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@[\w-]+)|(#[\w-]+)|(-?\d*\.?\d+[a-z%]*)|(--[\w-]+|\$[\w-]+|[A-Za-z_][\w-]*)|(\s+)|([\s\S])/;
const cssPattern = (lineComments: boolean) => {
  const comment = lineComments
    ? `${BLOCK_COMMENT.source}|${LINE_COMMENT.source}`
    : BLOCK_COMMENT.source;
  return new RegExp(`(${comment})|${CSS_REST.source}`, "y");
};
const CSS_PATTERN = cssPattern(false);
const PREPROCESSOR_PATTERN = cssPattern(true);

/** CSS、SCSS、Less 的 @规则。Less 里其他 @ 开头的是变量 */
const AT_RULES = new Set(
  "media import use forward mixin include function return if else each for while extend at-root supports keyframes layer font-face container property charset namespace page theme apply utility variant plugin source config tailwind".split(
    " "
  )
);

/** 从这个位置往后，先遇到 { 的话，这一段是选择器；先遇到 ; 或 } 的话是"属性: 值" */
const isSelectorAhead = (code: string, from: number) => /^[^;{}]*\{/.test(code.slice(from));

const highlightCss = (code: string, language: "css" | "scss" | "less"): Token[][] => {
  const { lines, push } = createLines();
  const pattern = language === "css" ? CSS_PATTERN : PREPROCESSOR_PATTERN;

  // 正在"属性: 值"的值里面（冒号之后，到 ; 或 } 为止）
  let inValue = false;
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match) {
    const [text, comment, string, atRule, hash, number, name] = match;
    const after = pattern.lastIndex;
    if (comment) push("comment", text);
    else if (string) push("string", text);
    else if (atRule) {
      // Less 的变量（@radius: 4px）和属性名、值里的变量一样着色
      push(language === "less" && !AT_RULES.has(text.slice(1)) ? "attr" : "control", text);
    } else if (number) push("number", text);
    else if (hash) push(inValue ? "string" : "selector", text);
    else if (name) {
      if (inValue) {
        push(code[after] === "(" ? "function" : /^(--|\$)/.test(name) ? "attr" : "string", text);
      } else if (isSelectorAhead(code, match.index)) push("selector", text);
      // 调用 mixin：@include pill(...)、.tone(...)
      else push(code[after] === "(" ? "function" : "attr", text);
    } else {
      push("plain", text);
      if (text === ":" && !inValue && !isSelectorAhead(code, match.index)) inValue = true;
      else if (text === ";" || text === "{" || text === "}") inValue = false;
    }
    match = pattern.exec(code);
  }
  return lines;
};

export type Language = "tsx" | "css" | "scss" | "less";

/** 按文件名决定用哪种着色 */
export const languageOf = (file: string): Language => {
  if (file.endsWith(".css")) return "css";
  if (/\.s[ac]ss$/.test(file)) return "scss";
  if (file.endsWith(".less")) return "less";
  return "tsx";
};

/** 把代码分成一行一行的词 */
export const highlight = (code: string, language: Language = "tsx"): Token[][] =>
  language === "tsx" ? highlightTsx(code) : highlightCss(code, language);
