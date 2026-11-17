// 在界面里新建组件：放进工作区的草稿（存在这个浏览器的 IndexedDB 里）。
import type { Manifest } from "../shared/manifest";
import { t } from "./i18n";

/** 名字不能用时返回原因，能用时返回 undefined */
export const checkComponentName = (
  name: string,
  manifest: Manifest,
  /** 工作区里已有的文件。同名的文件在（哪怕暂时没被认成组件）也不能用，免得覆盖 */
  existingFiles: string[] = []
): string | undefined => {
  if (name === "") return t().newComponent.nameRequired;
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return t().newComponent.invalidName;
  if (manifest.components.some((c) => c.name === name)) return t().newComponent.exists(name);
  if (existingFiles.includes(newComponentFile(name, manifest)))
    return t().newComponent.exists(name);
  return undefined;
};

/** 新建的组件放在组件目录下，文件名就是组件名 */
export const newComponentFile = (name: string, manifest: Manifest) =>
  `${manifest.componentsDir.replace(/\/+$/, "")}/${name}.tsx`;

/** 新建时的内容：一个能直接显示出来的最小组件，带一个文字 prop 和 children */
export const newComponentSource = (name: string) => {
  const title = t().newComponent.title;
  return `import type { ReactNode } from "react";

export interface ${name}Props {
  /** ${title} */
  title?: string;
  children?: ReactNode;
}

export function ${name}({ title = ${JSON.stringify(title)}, children }: ${name}Props) {
  return (
    <section style={{ border: "1px solid #d4d4d8", borderRadius: 8, padding: 12 }}>
      <strong>{title}</strong>
      <div>{children}</div>
    </section>
  );
}
`;
};
