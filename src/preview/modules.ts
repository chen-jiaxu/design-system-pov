// 预览页里的模块加载：界面把编译好的组件（CommonJS 写法）和样式交过来，这里按 require 的顺序执行。
// 不用打包工具，也不经过服务器，GitHub Pages 这样只放静态文件的地方也能用。

/** 编译好的一个文件 */
export type PreviewModule =
  /** 脚本：编译成 CommonJS 的代码。deps 是 import 的写法 → 工作区里的文件 */
  | { kind: "script"; code: string; deps: Record<string, string> }
  /** 样式：被 require 时放进页面 */
  | { kind: "style"; code: string }
  /** 还不支持的文件（SCSS、Less 等），被 require 时报错 */
  | { kind: "unsupported"; reason: string };

export interface ModuleSystem {
  /** 加载工作区里的文件（相对路径，如 src/components/Button.tsx），返回它的导出 */
  require: (file: string) => Record<string, unknown>;
  /** 去掉放进页面的样式 */
  dispose: () => void;
}

export interface ModuleSystemOptions {
  modules: Record<string, PreviewModule>;
  /** 预览页自己带的包（react 等）。import 的写法 → 模块 */
  externals: Record<string, unknown>;
  /** 找不到的包、文件时的报错 */
  unknownModule: (specifier: string, from: string) => string;
  document?: Document;
}

export const createModuleSystem = (options: ModuleSystemOptions): ModuleSystem => {
  const doc = options.document ?? document;
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const styles: HTMLStyleElement[] = [];

  const load = (file: string, from: string): Record<string, unknown> => {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const module = options.modules[file];
    if (!module) throw new Error(options.unknownModule(file, from));
    if (module.kind === "unsupported") throw new Error(module.reason);

    const record = { exports: {} as Record<string, unknown> };
    cache.set(file, record);
    if (module.kind === "style") {
      const style = doc.createElement("style");
      style.dataset.dspFile = file;
      style.textContent = module.code;
      doc.head.append(style);
      styles.push(style);
      return record.exports;
    }

    const localRequire = (specifier: string) => {
      const target = module.deps[specifier];
      if (target !== undefined) return load(target, file);
      if (specifier in options.externals) return options.externals[specifier];
      throw new Error(options.unknownModule(specifier, file));
    };
    try {
      // sourceURL：报错的堆栈里显示工作区里的文件名
      const run = new Function(
        "require",
        "module",
        "exports",
        `${module.code}\n//# sourceURL=${file}`
      );
      run(localRequire, record, record.exports);
    } catch (error) {
      // 执行失败的不留在 cache 里，下次再试
      cache.delete(file);
      throw error;
    }
    return record.exports;
  };

  return {
    dispose: () => {
      for (const style of styles) style.remove();
      styles.length = 0;
      cache.clear();
    },
    require: (file) => load(file, file),
  };
};
