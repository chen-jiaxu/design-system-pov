/** 分析用的类型定义（TypeScript 的 lib、React 的类型）。由 vite.config.ts 的插件在构建时生成 */
declare module "virtual:type-libs" {
  const libs: Readonly<Record<string, string>>;
  export default libs;
}
