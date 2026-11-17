import type * as TS from "typescript";

import { DEFAULT_COMPONENTS_DIR } from "../shared/components-dir.js";
import type { ComponentInfo, Manifest, ProviderInfo } from "../shared/manifest.js";
import type { Files } from "./files.js";
import { basename, normalize, toRelative } from "./posix.js";
import { findFunctionNode, readDefaults, readProps } from "./props.js";
import { readClassNameTokens } from "./tailwind.js";
import { readTokenDefinitions } from "./token-definitions.js";
import { readImportedCss, readUsedTokens } from "./tokens.js";
import {
  createHost,
  createSystem,
  readCompilerOptions,
  type TypeLibs,
  type TypeScript,
} from "./typescript.js";

export interface AnalyzeOptions {
  /** 工作区的文件（原本的内容加上草稿） */
  files: Files;
  /** 组件所在的目录，相对于工作区根目录 */
  componentsDir?: string;
  /** 工作区的名字，界面的顶栏上显示 */
  name?: string;
}

export { DEFAULT_COMPONENTS_DIR } from "../shared/components-dir.js";

const IGNORED_FILE = /\.(test|spec|stories)\.tsx$/;

/** 组件目录下的 .tsx（测试、stories 不算） */
export const findComponentFiles = (files: Files, componentsDir: string): string[] => {
  const prefix = `${normalize(componentsDir)}/`;
  return files
    .list()
    .filter(
      (file) =>
        file.startsWith(prefix) &&
        file.endsWith(".tsx") &&
        !IGNORED_FILE.test(file) &&
        !file.split("/").includes("node_modules")
    );
};

/** 返回值像 JSX 的函数才算组件。 */
const returnsJsx = (checker: TS.TypeChecker, signature: TS.Signature) =>
  /Element|ReactNode|null/.test(checker.typeToString(signature.getReturnType()));

/** Provider 只是给子组件提供数据，不是要展示的 UI 组件。按命名惯例判断。 */
const isProvider = (name: string) => /Provider$/.test(name);

/** 返回 Promise 的组件是异步的 Server Component，不能在浏览器里渲染。 */
const isAsync = (checker: TS.TypeChecker, signature: TS.Signature) =>
  /^Promise</.test(checker.typeToString(signature.getReturnType()));

const ASYNC_REASON = "异步组件（Server Component），不能在浏览器里渲染";

const displayName = (
  ts: TypeScript,
  exportName: string,
  declaration: TS.Declaration,
  file: string
) => {
  if (exportName !== "default") return exportName;
  if (
    (ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration)) &&
    declaration.name
  ) {
    return declaration.name.getText();
  }
  return basename(file, ".tsx");
};

const readComponents = (
  ts: TypeScript,
  checker: TS.TypeChecker,
  source: TS.SourceFile,
  themeTokens: string[],
  files: Files
): { components: ComponentInfo[]; providers: ProviderInfo[] } => {
  const components: ComponentInfo[] = [];
  const providers: ProviderInfo[] = [];
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return { components, providers };

  // 组件 CSS 里用到的变量，加上类名对应的 Tailwind theme 变量
  const tokens = [
    ...new Set([
      ...readUsedTokens(ts, source, files),
      ...readClassNameTokens(ts, source, themeTokens),
    ]),
  ];
  const styles = readImportedCss(ts, source, files).map(toRelative);
  const draft = files.isDraftOnly(source.fileName);
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) continue;

    const name = displayName(ts, exported.name, declaration, source.fileName);
    if (!/^[A-Z]/.test(name)) continue;

    const signature = checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures()[0];
    if (!signature || signature.parameters.length > 1 || !returnsJsx(checker, signature)) continue;

    const propsSymbol = signature.parameters[0];
    const propsType = propsSymbol
      ? checker.getTypeOfSymbolAtLocation(propsSymbol, declaration)
      : undefined;
    const defaults = readDefaults(ts, findFunctionNode(ts, declaration));
    const file = toRelative(source.fileName);

    if (isProvider(name)) {
      // 接收 children 的才能包在组件外面
      const { props } = readProps(ts, checker, propsType, declaration, defaults);
      if (props.some((p) => p.name === "children") && !isAsync(checker, signature)) {
        providers.push({
          exportName: exported.name,
          file,
          name,
          props: props.filter((p) => p.name !== "children"),
        });
      }
      continue;
    }

    components.push({
      exportName: exported.name,
      file,
      name,
      styles,
      tokens,
      ...readProps(ts, checker, propsType, declaration, defaults),
      ...(isAsync(checker, signature)
        ? { unavailable: { code: "async" as const, reason: ASYNC_REASON } }
        : {}),
      ...(draft ? { draft: true as const } : {}),
    });
  }
  return { components, providers };
};

/** package.json 的 dependencies / devDependencies 里有 tailwindcss 吗 */
const usesTailwind = (files: Files): boolean => {
  try {
    const pkg = JSON.parse(files.read("/package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.tailwindcss ?? pkg.devDependencies?.tailwindcss);
  } catch {
    return false;
  }
};

/**
 * 分析器。TypeScript 和类型定义由调用的一方给（浏览器里在 Worker 中加载）。
 * 类型定义解析一次以后留着，之后每次分析只解析工作区里变了的文件。
 */
export const createAnalyzer = (ts: TypeScript, libs: TypeLibs) => {
  const cache = new Map<string, TS.SourceFile>();
  let previous: TS.Program | undefined;

  const analyze = ({
    files,
    componentsDir = DEFAULT_COMPONENTS_DIR,
    name = "workspace",
  }: AnalyzeOptions): Manifest => {
    const system = createSystem(files, libs);
    const componentFiles = findComponentFiles(files, componentsDir);
    const options = readCompilerOptions(ts, system);
    const program = ts.createProgram({
      host: createHost(ts, system, cache),
      oldProgram: previous,
      options,
      rootNames: componentFiles,
    });
    previous = program;
    const checker = program.getTypeChecker();
    const tokens = readTokenDefinitions(files);
    const themeTokens = tokens.filter((t) => t.source === "theme").map((t) => t.name);

    const found = componentFiles.flatMap((file) => {
      const source = program.getSourceFile(file);
      return source ? [readComponents(ts, checker, source, themeTokens, files)] : [];
    });

    return {
      components: found.flatMap((f) => f.components),
      componentsDir,
      providers: found.flatMap((f) => f.providers),
      root: name,
      tailwind: usesTailwind(files),
      tokens,
    };
  };

  return { analyze };
};
