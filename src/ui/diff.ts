// 按行比较两段文字，给"变更"tab 的左右对比用。

export interface DiffSide {
  /** 行号，从 1 开始 */
  line: number;
  text: string;
}

/** 对比里的一行：左边是原来的，右边是改过的。只有一边时，另一边是空的 */
export interface DiffRow {
  left?: DiffSide;
  right?: DiffSide;
  changed: boolean;
}

/** 行数的乘积超过这个数就不找相同的行了，中间整段算作改动（免得卡住） */
const MAX_CELLS = 4_000_000;

const splitLines = (text: string) => text.replace(/\n$/, "").split("\n");

export const diffLines = (before: string, after: string): DiffRow[] => {
  const a = splitLines(before);
  const b = splitLines(after);

  // 先去掉开头和结尾相同的行，剩下的才比较
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  // 中间部分：找出最长的相同的行的序列，其余的是删掉的（只在左边）和加上的（只在右边）
  const ops: ("same" | "remove" | "add")[] = [];
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_CELLS) {
    ops.push(...midA.map(() => "remove" as const), ...midB.map(() => "add" as const));
  } else {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          midA[i] === midB[j]
            ? (table[(i + 1) * width + j + 1] as number) + 1
            : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push("same");
        i++;
        j++;
      } else if (
        j >= m ||
        (i < n && (table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number))
      ) {
        ops.push("remove");
        i++;
      } else {
        ops.push("add");
        j++;
      }
    }
  }

  const rows: DiffRow[] = [];
  let left = 0;
  let right = 0;
  const same = () => {
    rows.push({
      changed: false,
      left: { line: left + 1, text: a[left] as string },
      right: { line: right + 1, text: b[right] as string },
    });
    left++;
    right++;
  };
  for (let k = 0; k < head; k++) same();
  // 连在一起的删和加排在同一行上：左边是原来的，右边是改成的
  for (let k = 0; k < ops.length; ) {
    if (ops[k] === "same") {
      same();
      k++;
      continue;
    }
    let removed = 0;
    let added = 0;
    while (k < ops.length && ops[k] !== "same") {
      if (ops[k] === "remove") removed++;
      else added++;
      k++;
    }
    for (let r = 0; r < Math.max(removed, added); r++) {
      rows.push({
        changed: true,
        left: r < removed ? { line: left + 1, text: a[left++] as string } : undefined,
        right: r < added ? { line: right + 1, text: b[right++] as string } : undefined,
      });
    }
  }
  for (let k = 0; k < tail; k++) same();
  return rows;
};
