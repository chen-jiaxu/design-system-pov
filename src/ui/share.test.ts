import { describe, expect, it } from "vitest";

import type { TokenScheme } from "./design-tokens";
import { decodeScheme, encodeScheme, isShareHash } from "./share";

const scheme: TokenScheme = {
  confirmed: true,
  groups: [
    {
      id: "g",
      name: "ブランド",
      tokens: [
        {
          description: "主ボタン",
          id: "t",
          name: "主色",
          token: "--brand-600",
          type: "color",
          value: "#175AA7",
        },
      ],
    },
  ],
  id: "s",
  name: "案 B",
  note: "推奨",
};

describe("share", () => {
  it("方案压缩进链接再读回来：内容一样，id 换成新的", async () => {
    const hash = await encodeScheme(scheme);
    expect(isShareHash(`#${hash}`)).toBe(true);
    expect(hash.length).toBeLessThan(400);
    const back = await decodeScheme(`#${hash}`);
    expect(back?.name).toBe("案 B");
    expect(back?.groups[0]?.tokens[0]).toMatchObject({ token: "--brand-600", value: "#175AA7" });
    expect(back?.id).not.toBe("s");
    // 状态照原样带过来（以前的 confirmed: true 是已批准）
    expect(back?.status).toBe("approved");
  });

  it("评审中的方案：状态和时间一起带过来", async () => {
    const reviewing = { ...scheme, confirmed: undefined, status: "review" as const, statusAt: 1 };
    const back = await decodeScheme(`#${await encodeScheme(reviewing)}`);
    expect(back).toMatchObject({ status: "review", statusAt: 1 });
  });

  it("不是分享的链接、坏掉的内容是 undefined", async () => {
    expect(await decodeScheme("#other")).toBeUndefined();
    expect(await decodeScheme("#share=@@@")).toBeUndefined();
  });
});
