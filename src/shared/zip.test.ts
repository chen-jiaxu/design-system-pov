import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { describe, expect, it } from "vitest";

import { crc32, createZip, readZip } from "./zip.js";

const files = {
  "mocks/userList.json": '[{ "id": 1, "name": "小明" }]\n',
  "src/components/Hello.tsx": "export const Hello = () => <p>你好</p>;\n",
  "空的.txt": "",
};

describe("createZip", () => {
  it("校验值和 Node 自带的算法一致", () => {
    const bytes = new TextEncoder().encode("你好 zip");
    expect(crc32(bytes)).toBe(zlib.crc32(bytes));
  });

  it("目录里列出每个文件，按记下的位置能读回原来的内容", () => {
    const zip = createZip(files);
    const view = new DataView(zip.buffer);
    const decoder = new TextDecoder();
    // 最后 22 个字节是结尾的说明：文件数、目录的位置
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(3);

    let entry = view.getUint32(end + 16, true);
    const read: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      expect(view.getUint32(entry, true)).toBe(0x02014b50);
      const size = view.getUint32(entry + 24, true);
      const nameLength = view.getUint16(entry + 28, true);
      const local = view.getUint32(entry + 42, true);
      const name = decoder.decode(zip.subarray(entry + 46, entry + 46 + nameLength));
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      const start = local + 30 + nameLength;
      const data = zip.subarray(start, start + size);
      expect(view.getUint32(entry + 16, true)).toBe(zlib.crc32(data));
      read[name] = decoder.decode(data);
      entry += 46 + nameLength;
    }
    expect(read).toEqual(files);
  });

  // 系统里有 unzip 命令时，再用它实际解开一次
  const hasUnzip = (() => {
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.runIf(hasUnzip)("unzip 命令能解开", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-system-pov-zip-"));
    fs.writeFileSync(path.join(dir, "drafts.zip"), createZip(files));
    execFileSync("unzip", ["-q", "drafts.zip", "-d", "out"], { cwd: dir });
    for (const [name, text] of Object.entries(files)) {
      expect(fs.readFileSync(path.join(dir, "out", name), "utf8")).toBe(text);
    }
  });
});

describe("readZip", () => {
  it("读回自己打的包（中文的路径和内容也一样）", async () => {
    const files = { "src/a.css": ":root {}\n", "说明.txt": "你好\n" };
    expect(await readZip(createZip(files))).toEqual(files);
  });

  it("读压缩过的（deflate）文件", async () => {
    const text = "hello hello hello hello\n";
    const body = new Uint8Array(zlib.deflateRawSync(Buffer.from(text)));
    const name = new TextEncoder().encode("a.txt");
    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, body.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, body.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, 0, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length, true);
    const zip = new Uint8Array([...local, ...central, ...end]);
    expect(await readZip(zip)).toEqual({ "a.txt": text });
  });
});
