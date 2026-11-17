// 分析和编译用的 Worker。TypeScript 和类型定义都很大，第一次用到时才加载，界面不会卡住。
import { createAnalyzer } from "../analyzer/analyze";
import { createFiles } from "../analyzer/files";
import { createSystem, readCompilerOptions } from "../analyzer/typescript";
import { checkSyntax, createCompiler } from "./compile";
import { compileMessagesFor } from "./messages";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const setup = async () => {
  const [{ default: ts }, { default: libs }] = await Promise.all([
    import("typescript"),
    import("virtual:type-libs"),
  ]);
  return { analyzer: createAnalyzer(ts, libs), compile: createCompiler(ts), libs, ts };
};
let tools: ReturnType<typeof setup> | undefined;

const handle = async (request: WorkerRequest): Promise<WorkerResponse> => {
  // 加载失败（网络断了等）时不留着失败的结果，下一次请求再试
  tools ??= setup().catch((error: unknown) => {
    tools = undefined;
    throw error;
  });
  const { analyzer, compile, libs, ts } = await tools;
  const messages = compileMessagesFor(request.locale);
  if (request.type === "check") {
    return {
      error: checkSyntax(ts, request.file, request.text, messages),
      id: request.id,
      type: "check",
    };
  }
  const files = createFiles(request.base, request.drafts);
  const manifest = analyzer.analyze({
    componentsDir: request.componentsDir,
    files,
    name: request.name,
  });
  const system = createSystem(files, libs);
  const modules = compile(files, system, readCompilerOptions(ts, system), messages);
  return { id: request.id, manifest, modules, type: "build" };
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse;
  try {
    response = await handle(event.data);
  } catch (error) {
    response = {
      id: event.data.id,
      message: error instanceof Error ? error.message : String(error),
      type: "error",
    };
  }
  self.postMessage(response);
};
