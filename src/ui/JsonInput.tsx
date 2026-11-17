import { useEffect, useRef, useState } from "react";

import { t } from "./i18n";
import { jsonProblem } from "./mocks";

/**
 * 编辑 JSON 的输入框。打字的过程中内容常常不是合法的 JSON，所以自己留着正在打的字，
 * 只有合法时才通知外面（onValid）；不合法时在下面显示原因。
 */
export const JsonInput = ({
  label,
  text,
  onValid,
  rows = 6,
  fill = false,
}: {
  label: string;
  text: string;
  onValid: (text: string) => void;
  rows?: number;
  /** 占满所在的区域（Mock 数据的编辑页用） */
  fill?: boolean;
}) => {
  const [draft, setDraft] = useState(text);
  // 外面的值变了（恢复初始值、换了数据）而且不是自己刚通知出去的，就换成新的
  const sent = useRef(text);
  useEffect(() => {
    if (text === sent.current) return;
    sent.current = text;
    setDraft(text);
  }, [text]);
  const problem = jsonProblem(draft);

  return (
    <div className="js" data-fill={fill || undefined}>
      <textarea
        aria-invalid={problem !== undefined}
        aria-label={label}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="js-input"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (jsonProblem(next) === undefined) {
            sent.current = next;
            onValid(next);
          }
        }}
        rows={rows}
        spellCheck={false}
        value={draft}
        wrap="off"
      />
      {problem !== undefined && <p className="js-problem">{t().json.invalid(problem)}</p>}
    </div>
  );
};
