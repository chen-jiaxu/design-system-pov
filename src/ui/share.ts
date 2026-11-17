// 分享链接：一套 Design Token 的方案压缩后放在网址的 # 后面。打开链接的人确认后加进自己的工作区。
// # 后面的内容不会发给服务器，只在浏览器里读。
import { duplicateScheme, schemeStatus, type TokenScheme } from "./design-tokens";

const KEY = "share=";

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const pipe = async (bytes: Uint8Array, transform: CompressionStream | DecompressionStream) =>
  new Uint8Array(
    await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(transform)).arrayBuffer()
  );

/** 方案 → 链接里 # 后面的部分 */
export const encodeScheme = async (scheme: TokenScheme): Promise<string> => {
  const json = new TextEncoder().encode(JSON.stringify({ scheme, v: 1 }));
  return `${KEY}${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
};

/** 链接里 # 后面的部分 → 方案（新的 id）。不是分享的链接、读不出时返回 undefined */
export const decodeScheme = async (hash: string): Promise<TokenScheme | undefined> => {
  const text = hash.replace(/^#/, "");
  if (!text.startsWith(KEY)) return undefined;
  try {
    const bytes = await pipe(
      fromBase64Url(text.slice(KEY.length)),
      new DecompressionStream("deflate-raw")
    );
    const data = JSON.parse(new TextDecoder().decode(bytes)) as {
      v?: number;
      scheme?: TokenScheme;
    };
    if (data.v !== 1 || !data.scheme || !Array.isArray(data.scheme.groups)) return undefined;
    // 收到的方案用新的 id，状态（评审中、已批准）照原样带过来
    const { status, statusAt } = data.scheme;
    return {
      ...duplicateScheme(data.scheme, data.scheme.name),
      status: schemeStatus(data.scheme),
      ...(status && statusAt ? { statusAt } : {}),
    };
  } catch {
    return undefined;
  }
};

/** 分享用的完整网址 */
export const shareUrl = async (scheme: TokenScheme) => {
  const url = new URL(window.location.href);
  url.hash = await encodeScheme(scheme);
  return url.toString();
};

export const isShareHash = (hash: string) => hash.replace(/^#/, "").startsWith(KEY);
