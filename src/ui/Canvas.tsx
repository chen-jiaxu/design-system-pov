// 画布：中间是渲染出来的页面（能把大纲里的组件拖进去），右边是结构和选中组件的 props，下面是生成的代码。
import { type DragEvent, useState } from "react";

import { type CanvasTarget, DRAG_COMPONENT, DRAG_NODE, type TreeNode } from "../preview/protocol";
import type { ComponentInfo, Manifest } from "../shared/manifest";
import { CodeLines, CopyButton, download } from "./CodeView";
import {
  acceptsChildren,
  allNodes,
  type CanvasNode,
  type CanvasPage,
  findNode,
  insertNode,
  moveNode,
  newNodeId,
  removeNode,
  updateNode,
} from "./canvas-tree";
import { getLocale, useMessages } from "./i18n";
import { type Mocks, useMocks } from "./mocks";
import { Preview, type PreviewOptions } from "./Preview";
import { ComponentPanels, Panel } from "./Properties";
import { pageFiles, toPageCode } from "./page-code";
import { initialProps, toProps } from "./prop-values";
import { componentId } from "./selection";
import { toWrappers, useEnabledProviders } from "./wrappers";

export const byId = (manifest: Manifest) =>
  new Map(manifest.components.map((component) => [componentId(component), component]));

/** 页面的结构换成预览要的组件树 */
export const toTree = (
  nodes: CanvasNode[],
  components: Map<string, ComponentInfo>,
  mocks: Mocks
): TreeNode[] =>
  nodes.map((node) => {
    const component = components.get(node.component);
    const [file = "", exportName = ""] = node.component.split("#");
    const props = component ? toProps(component, node.props, mocks) : {};
    if (node.children.length > 0) delete props.children;
    return {
      children: toTree(node.children, components, mocks),
      container: acceptsChildren(component),
      exportName,
      file,
      functions:
        component?.props.filter((p) => p.control.kind === "function").map((p) => p.name) ?? [],
      id: node.id,
      props,
    };
  });

/** 新放上去的组件：props 用初始值 */
const newNode = (component: ComponentInfo): CanvasNode => ({
  children: [],
  component: componentId(component),
  id: newNodeId(),
  props: initialProps(component),
});

/** 拖进来的东西放到 target：大纲里的组件是新放上去，画布上的组件是挪过去 */
const applyDrop = (
  page: CanvasPage,
  manifest: Manifest,
  drop: { target: CanvasTarget; component?: string; node?: string }
): { page: CanvasPage; selected?: string } => {
  if (drop.node) return { page: moveNode(page, drop.node, drop.target), selected: drop.node };
  const component = drop.component ? byId(manifest).get(drop.component) : undefined;
  if (!component || component.unavailable) return { page };
  const node = newNode(component);
  return { page: insertNode(page, drop.target, node), selected: node.id };
};

export interface CanvasProps {
  manifest: Manifest;
  page: CanvasPage;
  onChange: (page: CanvasPage) => void;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
}

/** 中间：渲染出来的页面 */
export const CanvasSheet = ({
  manifest,
  page,
  onChange,
  selected,
  onSelect,
  previewOptions,
  onKey,
}: CanvasProps & {
  previewOptions: PreviewOptions;
  onKey?: (key: "undo" | "redo" | "delete") => void;
}) => {
  const mocks = useMocks();
  const enabled = useEnabledProviders();
  return (
    <Preview
      onKey={onKey}
      onDrop={(drop) => {
        const next = applyDrop(page, manifest, drop);
        onChange(next.page);
        if (next.selected) onSelect(next.selected);
      }}
      onSelect={(id) => onSelect(id ?? undefined)}
      options={previewOptions}
      request={{
        locale: getLocale(),
        nodes: toTree(page.nodes, byId(manifest), mocks),
        selected,
        type: "dsp:canvas",
        wrappers: toWrappers(manifest.providers, enabled, mocks),
      }}
    />
  );
};

type Zone = "before" | "inside" | "after";

/** 拖到结构里的一行上时放在哪：上半、下半，能放进去的组件中间一段是放进去 */
const zoneOf = (event: DragEvent<HTMLElement>, container: boolean): Zone => {
  const rect = event.currentTarget.getBoundingClientRect();
  const y = (event.clientY - rect.top) / rect.height;
  if (container && y > 0.3 && y < 0.7) return "inside";
  return y < 0.5 ? "before" : "after";
};

const isOurDrag = (event: DragEvent) =>
  event.dataTransfer.types.includes(DRAG_COMPONENT) || event.dataTransfer.types.includes(DRAG_NODE);

/** 右边：页面的结构（能拖动调整顺序、放进组件里） */
const StructurePanel = ({ manifest, page, onChange, selected, onSelect }: CanvasProps) => {
  const m = useMessages().page;
  const components = byId(manifest);
  const [hover, setHover] = useState<{ id: string | null; zone: Zone }>();

  const drop = (event: DragEvent<HTMLElement>, target: CanvasTarget) => {
    event.preventDefault();
    setHover(undefined);
    const next = applyDrop(page, manifest, {
      component: event.dataTransfer.getData(DRAG_COMPONENT) || undefined,
      node: event.dataTransfer.getData(DRAG_NODE) || undefined,
      target,
    });
    onChange(next.page);
    if (next.selected) onSelect(next.selected);
  };

  const rows = (nodes: CanvasNode[], parent: string | null, depth: number) =>
    nodes.map((node, index) => {
      const component = components.get(node.component);
      const container = acceptsChildren(component);
      return (
        <li key={node.id}>
          <button
            aria-pressed={node.id === selected}
            className="cs-row"
            data-drop={hover?.id === node.id ? hover.zone : undefined}
            draggable
            onClick={() => onSelect(node.id)}
            onDragLeave={() => setHover(undefined)}
            onDragOver={(event) => {
              if (!isOurDrag(event)) return;
              event.preventDefault();
              event.stopPropagation();
              setHover({ id: node.id, zone: zoneOf(event, container) });
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_NODE, node.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDrop={(event) => {
              event.stopPropagation();
              const zone = zoneOf(event, container);
              drop(
                event,
                zone === "inside"
                  ? { index: node.children.length, parent: node.id }
                  : { index: zone === "before" ? index : index + 1, parent }
              );
            }}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={component ? component.file : m.missing(node.component)}
            type="button"
          >
            {component?.name ?? m.missing(node.component)}
          </button>
          {node.children.length > 0 && <ul>{rows(node.children, node.id, depth + 1)}</ul>}
        </li>
      );
    });

  const found = selected ? findNode(page.nodes, selected) : undefined;
  const siblings = found
    ? found.parent === null
      ? page.nodes
      : (findNode(page.nodes, found.parent)?.node.children ?? [])
    : [];
  const move = (offset: number) => {
    if (!found || !selected) return;
    const index = found.index + offset;
    if (index < 0 || index >= siblings.length) return;
    // 往后挪一格：放到后一个的后面
    onChange(
      moveNode(page, selected, { index: offset > 0 ? index + 1 : index, parent: found.parent })
    );
  };

  return (
    <Panel title={m.structure(allNodes(page.nodes).length)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只接收拖放；每一行是能用键盘操作的按钮 */}
      <div
        className="cs-tree"
        data-drop={hover?.id === null ? "after" : undefined}
        onDragLeave={() => setHover(undefined)}
        onDragOver={(event) => {
          if (!isOurDrag(event)) return;
          event.preventDefault();
          setHover({ id: null, zone: "after" });
        }}
        onDrop={(event) => drop(event, { index: page.nodes.length, parent: null })}
      >
        {page.nodes.length === 0 ? (
          <p className="cs-empty">{m.structureEmpty}</p>
        ) : (
          <ul>{rows(page.nodes, null, 0)}</ul>
        )}
      </div>
      <p className="pp-mute">{m.structureHint}</p>
      {found && selected && (
        <div className="cs-actions">
          <button
            className="pp-button"
            disabled={found.index === 0}
            onClick={() => move(-1)}
            type="button"
          >
            {m.moveUp}
          </button>
          <button
            className="pp-button"
            disabled={found.index >= siblings.length - 1}
            onClick={() => move(1)}
            type="button"
          >
            {m.moveDown}
          </button>
          <button
            className="pp-button"
            onClick={() => {
              onChange(removeNode(page, selected));
              onSelect(undefined);
            }}
            type="button"
          >
            {m.remove}
          </button>
        </div>
      )}
    </Panel>
  );
};

/** 右边：结构，加上选中的组件的 props */
export const PagePanels = (props: CanvasProps & { onDeletePage: () => void }) => {
  const { manifest, page, onChange, selected } = props;
  const m = useMessages().page;
  const found = selected ? findNode(page.nodes, selected) : undefined;
  const component = found ? byId(manifest).get(found.node.component) : undefined;
  // 里面放了组件时，children 由它们组成，不在属性面板里填
  const shown: ComponentInfo | undefined =
    component && found && found.node.children.length > 0
      ? { ...component, props: component.props.filter((p) => p.name !== "children") }
      : component;
  return (
    <>
      <StructurePanel {...props} />
      {found && shown ? (
        <ComponentPanels
          component={shown}
          manifest={manifest}
          onPropChange={(name, value) =>
            onChange(
              updateNode(page, found.node.id, (node) => {
                const next = { ...node.props };
                if (value === undefined) delete next[name];
                else next[name] = value;
                return { ...node, props: next };
              })
            )
          }
          onPropReset={() =>
            onChange(
              updateNode(page, found.node.id, (node) => ({ ...node, props: initialProps(shown) }))
            )
          }
          propValues={found.node.props}
        />
      ) : (
        <Panel title={m.nodeTitle}>
          <p className="pp-mute">{found ? m.missing(found.node.component) : m.noSelection}</p>
        </Panel>
      )}
      <div className="cs-page-actions">
        <button className="pp-button" onClick={props.onDeletePage} type="button">
          {m.deletePage}
        </button>
      </div>
    </>
  );
};

/** 下面：生成的页面代码 */
export const PageCode = ({
  name,
  page,
  manifest,
}: {
  name: string;
  page: CanvasPage;
  manifest: Manifest;
}) => {
  const m = useMessages();
  const mocks = useMocks();
  const code = toPageCode(name, page, manifest, mocks);
  // 用到的组件被删掉了：生成的代码里只剩注释，这里说清楚
  const components = byId(manifest);
  const missing = [
    ...new Set(
      allNodes(page.nodes)
        .filter((node) => !components.has(node.component))
        .map((node) => node.component)
    ),
  ];
  return (
    <div className="cv">
      <div className="cv-tabs">
        <span className="cs-code-title" title={m.page.codeHint}>
          {pageFiles(name).code}
        </span>
        <span className="cv-spacer" />
        <button
          className="cv-copy"
          onClick={() => download(`${name}.tsx`, code)}
          title={m.code.downloadHint}
          type="button"
        >
          {m.code.download}
        </button>
        <CopyButton text={code} />
      </div>
      <div className="cv-body">
        {missing.length > 0 && (
          <p className="cv-note" data-tone="warn">
            {m.page.missingInCode(missing.join("、"))}
          </p>
        )}
        <CodeLines text={code} />
      </div>
    </div>
  );
};
