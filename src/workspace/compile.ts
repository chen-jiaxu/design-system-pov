// 把工作区的文件编译成预览页能执行的模块（见 src/preview/modules.ts）。在 Worker 里运行。
import type * as TS from "typescript";

import type { Files } from "../analyzer/files.js";
import { dirname, resolve, toRelative } from "../analyzer/posix.js";
import { STYLE_FILE } from "../analyzer/tokens.js";
import type { TypeScript, VirtualSystem } from "../analyzer/typescript.js";
import type { PreviewModule } from "../preview/modules.js";

const SCRIPT_FILE = /\.(tsx?|jsx?)$/;
const DECLARATION_FILE = /\.d\.ts$/;

/** 还不支持的样式写法：在浏览器里编译要带上很大的库，以后再加 */
const UNSUPPORTED_STYLE = /\.(scss|sass|less)$/;

export interface CompileMessages {
  unsupportedStyle: (file: string) => string;
  compileError: (file: string, line: string, reason: string) => string;
}

/** 编译时的设定：CommonJS，JSX 用 React 17 以后的方式 */
const transpileOptions = (ts: TypeScript): TS.CompilerOptions => ({
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});

/** 语法错误写成"哪个文件的第几行：什么错"。没有错误时返回 undefined */
export const checkSyntax = (
  ts: TypeScript,
  file: string,
  text: string,
  messages: CompileMessages
): string | undefined => {
  if (!SCRIPT_FILE.test(file)) return undefined;
  const { diagnostics = [] } = ts.transpileModule(text, {
    compilerOptions: transpileOptions(ts),
    fileName: file,
    reportDiagnostics: true,
  });
  const first = diagnostics[0];
  if (!first) return undefined;
  const reason = ts.flattenDiagnosticMessageText(first.messageText, "\n");
  const line =
    first.file && first.start !== undefined
      ? first.file.getLineAndCharacterOfPosition(first.start).line + 1
      : 1;
  return messages.compileError(file, String(line), reason);
};

/**
 * 编译器。编译结果按文件内容留着，内容没变的文件下次不再编译。
 * resolve 用分析时的设定（tsconfig 的路径别名等）找 import 的文件。
 */
export const createCompiler = (ts: TypeScript) => {
  const cache = new Map<string, { text: string; code: string; specifiers: string[] }>();

  const transpile = (file: string, text: string) => {
    const cached = cache.get(file);
    if (cached?.text === text) return cached;
    const code = ts.transpileModule(text, {
      compilerOptions: transpileOptions(ts),
      fileName: file,
    }).outputText;
    const specifiers = ts.preProcessFile(text, true, true).importedFiles.map((i) => i.fileName);
    const result = { code, specifiers, text };
    cache.set(file, result);
    return result;
  };

  return (
    files: Files,
    system: VirtualSystem,
    options: TS.CompilerOptions,
    messages: CompileMessages
  ): Record<string, PreviewModule> => {
    const host: TS.ModuleResolutionHost = {
      directoryExists: system.directoryExists,
      fileExists: system.fileExists,
      readFile: system.readFile,
      realpath: (file) => file,
    };
    /** import 的写法 → 工作区里的文件（绝对路径）。工作区以外的（react 等）返回 undefined */
    const resolveImport = (specifier: string, from: string): string | undefined => {
      const resolved = ts.resolveModuleName(specifier, from, options, host).resolvedModule;
      const target = resolved?.resolvedFileName;
      if (target && files.exists(target) && !DECLARATION_FILE.test(target)) return target;
      // TypeScript 不找样式文件，相对路径的自己找
      if (specifier.startsWith(".")) {
        const file = resolve(dirname(from), specifier);
        if (files.exists(file)) return file;
      }
      return undefined;
    };

    const modules: Record<string, PreviewModule> = {};
    for (const file of files.list()) {
      const name = toRelative(file);
      if (UNSUPPORTED_STYLE.test(file)) {
        modules[name] = { kind: "unsupported", reason: messages.unsupportedStyle(name) };
      } else if (STYLE_FILE.test(file)) {
        modules[name] = { code: files.read(file), kind: "style" };
      } else if (SCRIPT_FILE.test(file) && !DECLARATION_FILE.test(file)) {
        const { code, specifiers } = transpile(file, files.read(file));
        const deps: Record<string, string> = {};
        for (const specifier of specifiers) {
          const target = resolveImport(specifier, file);
          if (target) deps[specifier] = toRelative(target);
        }
        modules[name] = { code, deps, kind: "script" };
      }
    }
    return modules;
  };
};
