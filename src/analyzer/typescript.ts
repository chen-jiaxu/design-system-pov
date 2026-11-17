import type * as TS from "typescript";

import type { Files } from "./files.js";
import { dirname, normalize } from "./posix.js";

export type TypeScript = typeof TS;

/**
 * 类型定义：TypeScript 自带的 lib、React 的类型等。路径 → 内容，路径以 /node_modules/ 开头。
 * 浏览器里由构建时生成的模块提供（见 vite.config.ts），测试时从 node_modules 读。
 */
export type TypeLibs = Readonly<Record<string, string>>;

export const LIB_DIR = "/node_modules/typescript/lib";

/** 用到的 lib。不管工作区的 tsconfig 怎么写都用这几个，类型定义只带了这些 */
export const LIBS = ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"];

const DEFAULT_OPTIONS = (ts: TypeScript): TS.CompilerOptions => ({
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
});

/** 工作区的文件加上类型定义，当作一个文件系统 */
export interface VirtualSystem {
  fileExists: (file: string) => boolean;
  readFile: (file: string) => string | undefined;
  directoryExists: (directory: string) => boolean;
}

export const createSystem = (files: Files, libs: TypeLibs): VirtualSystem => {
  const directories = new Set<string>();
  for (const file of [...files.list(), ...Object.keys(libs)]) {
    for (let dir = dirname(file); dir !== "/"; dir = dirname(dir)) directories.add(dir);
  }
  return {
    directoryExists: (directory) => directory === "/" || directories.has(normalize(directory)),
    fileExists: (file) => files.exists(file) || normalize(file) in libs,
    readFile: (file) => (files.exists(file) ? files.read(file) : libs[normalize(file)]),
  };
};

/** 读工作区根目录的 tsconfig.json（路径别名等）。没有或读不了时用默认值 */
export const readCompilerOptions = (ts: TypeScript, system: VirtualSystem): TS.CompilerOptions => {
  const fixed = { lib: LIBS, noEmit: true, types: [] };
  const defaults = { ...DEFAULT_OPTIONS(ts), ...fixed };
  const text = system.readFile("/tsconfig.json");
  if (text === undefined) return defaults;
  const { config, error } = ts.parseConfigFileTextToJson("/tsconfig.json", text);
  if (error) return defaults;
  const host: TS.ParseConfigHost = {
    fileExists: system.fileExists,
    readDirectory: () => [],
    readFile: system.readFile,
    useCaseSensitiveFileNames: true,
  };
  const parsed = ts.parseJsonConfigFileContent(config, host, "/");
  return { ...DEFAULT_OPTIONS(ts), ...parsed.options, ...fixed };
};

/**
 * 给 TypeScript 用的 CompilerHost，只读内存里的文件。
 * 类型定义不会变，解析结果留在 cache 里，下次分析直接用（lib.dom.d.ts 很大）。
 */
export const createHost = (
  ts: TypeScript,
  system: VirtualSystem,
  cache: Map<string, TS.SourceFile>
): TS.CompilerHost => ({
  directoryExists: system.directoryExists,
  fileExists: system.fileExists,
  getCanonicalFileName: (file) => file,
  getCurrentDirectory: () => "/",
  getDefaultLibFileName: (options) => `${LIB_DIR}/${ts.getDefaultLibFileName(options)}`,
  getDefaultLibLocation: () => LIB_DIR,
  getDirectories: () => [],
  getNewLine: () => "\n",
  getSourceFile: (file, languageVersion) => {
    const text = system.readFile(file);
    if (text === undefined) return undefined;
    const cached = cache.get(file);
    if (cached && cached.text === text) return cached;
    const source = ts.createSourceFile(file, text, languageVersion, true);
    cache.set(file, source);
    return source;
  },
  readFile: system.readFile,
  realpath: (file) => file,
  useCaseSensitiveFileNames: () => true,
  writeFile: () => {},
});
