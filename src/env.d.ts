/// <reference types="vite/client" />

/** .env 里的设定（见根目录的 .env） */
interface ImportMetaEnv {
  /** 产品名 */
  readonly VITE_APP_NAME?: string;
  /** 部署的路径 */
  readonly VITE_BASE?: string;
}
