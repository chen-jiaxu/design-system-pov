import { describe, expect, it } from "vitest";

import type { Manifest } from "../shared/manifest";
import { setLocale } from "./i18n";
import { checkComponentName, newComponentFile, newComponentSource } from "./new-component";

// 别的测试可能换过语言，这里固定用中文
setLocale("zh");

const manifest = {
  components: [{ name: "Button" }],
  componentsDir: "src/components/",
} as unknown as Manifest;

describe("新建组件", () => {
  it("名字要大写开头、只用字母和数字、不和已有的重名", () => {
    expect(checkComponentName("UserCard", manifest)).toBeUndefined();
    expect(checkComponentName("", manifest)).toBe("请输入组件名");
    expect(checkComponentName("userCard", manifest)).toContain("大写开头");
    expect(checkComponentName("User-Card", manifest)).toContain("大写开头");
    expect(checkComponentName("Button", manifest)).toBe("已经有叫 Button 的组件");
  });

  it("同名的文件已经在（暂时没被认成组件）时也不行，免得覆盖", () => {
    expect(checkComponentName("Broken", manifest, ["src/components/Broken.tsx"])).toBe(
      "已经有叫 Broken 的组件"
    );
    expect(checkComponentName("Broken", manifest, ["src/components/other/Broken.tsx"])).toBe(
      undefined
    );
  });

  it("放在组件目录下，内容里的名字都换成组件名", () => {
    expect(newComponentFile("UserCard", manifest)).toBe("src/components/UserCard.tsx");
    const source = newComponentSource("UserCard");
    expect(source).toContain("export function UserCard(");
    expect(source).toContain("export interface UserCardProps");
  });

  it("换了语言后，提示和新建的内容都用那种语言", () => {
    setLocale("en");
    expect(checkComponentName("", manifest)).toBe("Enter a component name");
    expect(newComponentSource("UserCard")).toContain('title = "Title"');
    setLocale("ja");
    expect(checkComponentName("Button", manifest)).toBe(
      "Button というコンポーネントはすでにあります"
    );
    setLocale("zh");
    expect(newComponentSource("UserCard")).toContain('title = "标题"');
  });
});
