import { useState } from "react";

import { DRAG_COMPONENT } from "../preview/protocol";
import type { Manifest } from "../shared/manifest";
import { type Messages, useMessages } from "./i18n";
import { componentId, isSame, type Selection } from "./selection";

interface Branch {
  id: string;
  label: string;
  empty: string;
  items: {
    key: string;
    label: string;
    note?: string;
    selection: Selection;
    /** 能拖到画布上的组件：它的"文件#导出名" */
    drag?: string;
  }[];
  /** 这一组能新建东西时，"+" 按钮的说明和输入框的提示 */
  create?: { title: string; placeholder: string };
  /** 能从示例添加时（页面）：按钮上的字和说明 */
  sample?: { label: string; title: string };
}

// Design Token 在顶栏切换的另一个界面里；Mock 数据暂时不用
const buildTree = (manifest: Manifest, pages: string[], m: Messages): Branch[] => [
  {
    create: {
      placeholder: m.outliner.componentPlaceholder,
      title: m.outliner.newComponent,
    },
    empty: m.outliner.noComponents(manifest.componentsDir),
    id: "components",
    items: manifest.components.map((component) => ({
      key: componentId(component),
      label: component.name,
      note: component.unavailable
        ? m.outliner.unavailable
        : component.draft
          ? m.outliner.draft
          : undefined,
      selection: { id: componentId(component), kind: "component" },
      ...(component.unavailable ? {} : { drag: componentId(component) }),
    })),
    label: m.app.group.component,
  },
  {
    create: { placeholder: m.outliner.pagePlaceholder, title: m.outliner.newPage },
    sample: { label: m.outliner.sample, title: m.outliner.addSample },
    empty: m.outliner.noPages,
    id: "pages",
    items: pages.map((name) => ({
      key: name,
      label: name,
      selection: { kind: "page", name },
    })),
    label: m.app.group.page,
  },
];

export const Outliner = ({
  manifest,
  selection,
  pages,
  onSelect,
  onCreate,
  onAddSample,
}: {
  manifest: Manifest;
  selection: Selection | undefined;
  onSelect: (selection: Selection) => void;
  pages: string[];
  /** 在这一组（"components" 或 "pages"）里新建。名字不能用时返回 false，输入框留着让人改 */
  onCreate: (branch: string, name: string) => Promise<boolean>;
  /** 从示例添加页面 */
  onAddSample?: () => void;
}) => {
  const m = useMessages();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // 正在哪一组里输入新东西的名字
  const [naming, setNaming] = useState<string>();
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: 树的键盘操作尚未实现，确定大纲内容时再处理
    <ul className="ol-tree" role="tree">
      {buildTree(manifest, pages, m).map((branch) => {
        const open = !closed.has(branch.id);
        return (
          // biome-ignore lint/a11y/useFocusableInteractive: 树的键盘操作尚未实现，确定大纲内容时再处理
          <li aria-expanded={open} className="ol-group" key={branch.id} role="treeitem">
            <button className="ol-branch" onClick={() => toggle(branch.id)} type="button">
              <span aria-hidden="true" className="ol-caret">
                {open ? "▾" : "▸"}
              </span>
              {branch.label}
              <span className="ol-count">{branch.items.length}</span>
            </button>
            {branch.sample && onAddSample && (
              <button
                className="ol-add ol-sample"
                onClick={onAddSample}
                title={branch.sample.title}
                type="button"
              >
                {branch.sample.label}
              </button>
            )}
            {branch.create && (
              <button
                aria-label={branch.create.title}
                className="ol-add"
                onClick={() => {
                  setClosed((prev) => new Set([...prev].filter((id) => id !== branch.id)));
                  setNaming(branch.id);
                }}
                title={branch.create.title}
                type="button"
              >
                +
              </button>
            )}
            {open && (
              // biome-ignore lint/a11y/useSemanticElements: tree 中的 group，不是 fieldset
              <ul role="group">
                {branch.create && naming === branch.id && (
                  <li role="none">
                    <input
                      aria-label={m.outliner.newName}
                      // biome-ignore lint/a11y/noAutofocus: 点了"+"以后马上要输入名字
                      autoFocus
                      className="ol-input"
                      onBlur={() => setNaming(undefined)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setNaming(undefined);
                        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                        onCreate(branch.id, event.currentTarget.value.trim()).then((created) => {
                          if (created) setNaming(undefined);
                        });
                      }}
                      placeholder={branch.create.placeholder}
                      spellCheck={false}
                    />
                  </li>
                )}
                {branch.items.length === 0 && naming !== branch.id && (
                  <li className="ol-empty">{branch.empty}</li>
                )}
                {branch.items.map((item) => (
                  <li key={item.key} role="none">
                    <button
                      aria-selected={isSame(selection, item.selection)}
                      className="ol-leaf"
                      draggable={item.drag !== undefined}
                      onClick={() => onSelect(item.selection)}
                      onDragStart={(event) => {
                        if (!item.drag) return;
                        event.dataTransfer.setData(DRAG_COMPONENT, item.drag);
                        event.dataTransfer.setData("text/plain", item.label);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      role="treeitem"
                      title={item.drag ? m.outliner.dragHint : undefined}
                      type="button"
                    >
                      {item.label}
                      {item.note && <span className="ol-note">{item.note}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
};
