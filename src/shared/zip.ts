// 把几个文本文件打成一个 zip。不依赖库：不压缩，只按 zip 的格式把内容原样放进去，
// 草稿都是不大的源码文件，这样就够了。

let table: Uint32Array | undefined;

/** zip 用来检查内容有没有坏的校验值（CRC-32） */
export const crc32 = (bytes: Uint8Array): number => {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (table[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** 按小端序写数字的小工具 */
const writer = (size: number) => {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  return {
    bytes,
    u16: (value: number) => {
      view.setUint16(offset, value, true);
      offset += 2;
    },
    u32: (value: number) => {
      view.setUint32(offset, value, true);
      offset += 4;
    },
  };
};

/** 文件名用 UTF-8 */
const UTF8_FLAG = 0x0800;
/** zip 里的时间从 1980 年算起，这里固定写 1980-01-01 */
const DOS_DATE = 0x0021;

/** files：路径（用 / 分隔）→ 内容 */
export const createZip = (files: Record<string, string>): Uint8Array => {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const [path, text] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);

    // 每个文件前面的说明
    const local = writer(30);
    local.u32(0x04034b50);
    local.u16(20); // 解开它需要的 zip 版本
    local.u16(UTF8_FLAG);
    local.u16(0); // 不压缩
    local.u16(0); // 时间
    local.u16(DOS_DATE);
    local.u32(crc);
    local.u32(data.length);
    local.u32(data.length);
    local.u16(name.length);
    local.u16(0);

    // 最后的目录里再写一遍，带上这个文件在 zip 里的位置
    const entry = writer(46);
    entry.u32(0x02014b50);
    // 生成它的系统写成 Unix：有的 unzip 不认 UTF-8 的标记，写成 DOS 的话会把中文文件名转坏
    entry.u16(0x0314);
    entry.u16(20);
    entry.u16(UTF8_FLAG);
    entry.u16(0);
    entry.u16(0);
    entry.u16(DOS_DATE);
    entry.u32(crc);
    entry.u32(data.length);
    entry.u32(data.length);
    entry.u16(name.length);
    entry.u16(0); // 附加信息
    entry.u16(0); // 注释
    entry.u16(0); // 分卷
    entry.u16(0); // 内部属性
    entry.u32((0o100644 << 16) >>> 0); // 外部属性：普通文件，自己能读写、别人能读
    entry.u32(offset);

    parts.push(local.bytes, name, data);
    directory.push(entry.bytes, name);
    offset += 30 + name.length + data.length;
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const count = Object.keys(files).length;
  const end = writer(22);
  end.u32(0x06054b50);
  end.u16(0);
  end.u16(0);
  end.u16(count);
  end.u16(count);
  end.u32(directorySize);
  end.u32(offset);
  end.u16(0);

  const all = [...parts, ...directory, end.bytes];
  const zip = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of all) {
    zip.set(part, position);
    position += part.length;
  }
  return zip;
};

/**
 * 读 zip 里的文本文件：路径 → 内容。不压缩（store）和一般的压缩（deflate）都认，
 * 解压用浏览器自带的 DecompressionStream。文件夹、读不出的文件跳过
 */
export const readZip = async (data: Uint8Array): Promise<Record<string, string>> => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // 结尾的目录记录（End of Central Directory）：从后往前找
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = data.subarray(start, start + compressed);
    if (method === 0) {
      files[name] = decoder.decode(raw);
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const stream = new Blob([raw as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      files[name] = await new Response(stream).text();
    }
  }
  return files;
};
