// 画布的操作（预览页里）：点击选中组件、选中的加框、从界面拖进来的组件放到哪里。
// 组件外面包着 display: contents 的 <div data-dsp-node>，不影响布局，用它找到点的是哪个组件。
import {
  type CanvasTarget,
  DRAG_COMPONENT,
  DRAG_NODE,
  type PreviewEvent,
  type TreeNode,
} from "./protocol";

interface NodeInfo {
  parent: string | null;
  index: number;
  container: boolean;
  childCount: number;
}

const ACCENT = "#3b82f6";

/** 组件实际占的范围（包着它的 div 是 display: contents，自己没有大小） */
const rectOf = (element: Element): DOMRect => {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
};

const overlay = (doc: Document, style: Partial<CSSStyleDeclaration>) => {
  const element = doc.createElement("div");
  Object.assign(element.style, {
    display: "none",
    pointerEvents: "none",
    position: "fixed",
    zIndex: "2147483647",
    ...style,
  });
  doc.body.append(element);
  return element;
};

const place = (
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number }
) =>
  Object.assign(element.style, {
    display: "block",
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
  });

export const installCanvas = (post: (event: PreviewEvent) => void, doc: Document = document) => {
  let enabled = false;
  let selected: string | undefined;
  let rootCount = 0;
  const nodes = new Map<string, NodeInfo>();
  const selection = overlay(doc, { borderRadius: "2px", outline: `2px solid ${ACCENT}` });
  const indicator = overlay(doc, { background: ACCENT, borderRadius: "2px" });

  const elementOf = (id: string) =>
    doc.querySelector(`[data-dsp-node="${CSS.escape(id)}"]`) ?? undefined;

  const showSelection = () => {
    const element = enabled && selected ? elementOf(selected) : undefined;
    if (!element) {
      selection.style.display = "none";
      return;
    }
    const rect = rectOf(element);
    place(selection, {
      height: rect.height + 4,
      left: rect.left - 2,
      top: rect.top - 2,
      width: rect.width + 4,
    });
  };

  /** 拖到这个位置时放到哪里，以及提示画在哪里。moving 是正在挪的组件（不能放进它自己里面） */
  const targetAt = (clientY: number, under: Element | null, moving?: string): CanvasTarget => {
    let element = under?.closest?.("[data-dsp-node]") ?? null;
    // 指着正在挪的组件或它里面时，当作指着它本身的前后
    const self = moving ? elementOf(moving) : undefined;
    if (self && element && self.contains(element)) element = self;
    const id = element?.getAttribute("data-dsp-node");
    const info = id ? nodes.get(id) : undefined;
    if (!element || !id || !info) {
      // 空白处：放在最后
      const last = doc.querySelector("[data-dsp-root] > [data-dsp-node]:last-child");
      const rect = last
        ? rectOf(last)
        : doc.querySelector("[data-dsp-root]")?.getBoundingClientRect();
      if (rect)
        place(indicator, {
          height: 3,
          left: rect.left,
          top: last ? rect.bottom + 6 : rect.top + 24,
          width: Math.max(rect.width, 120),
        });
      indicator.style.outline = "none";
      return { index: rootCount, parent: null };
    }
    const rect = rectOf(element);
    const edge = Math.min(rect.height * 0.25, 16);
    if (
      info.container &&
      clientY > rect.top + edge &&
      clientY < rect.bottom - edge &&
      element !== self
    ) {
      // 放进这个组件里（最后面）
      Object.assign(indicator.style, {
        background: "rgba(59, 130, 246, 0.12)",
        outline: `2px dashed ${ACCENT}`,
      });
      place(indicator, rect);
      return { index: info.childCount, parent: id };
    }
    const before = clientY < rect.top + rect.height / 2;
    Object.assign(indicator.style, { background: ACCENT, outline: "none" });
    place(indicator, {
      height: 3,
      left: rect.left,
      top: before ? rect.top - 4 : rect.bottom + 1,
      width: rect.width,
    });
    return { index: before ? info.index : info.index + 1, parent: info.parent };
  };

  const isOurDrag = (event: DragEvent) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes(DRAG_COMPONENT) || types.includes(DRAG_NODE);
  };

  // 画布上按住组件拖动：挪到别的地方（不经过浏览器的拖放，组件外面的 div 是 display: contents，拖不起来）
  let press: { id: string; x: number; y: number } | undefined;
  let dragging = false;
  /** 拖完以后跟着来的 click 不算选中 */
  let swallowClick = false;
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (!enabled || event.button !== 0) return;
      const id = (event.target as Element | null)
        ?.closest?.("[data-dsp-node]")
        ?.getAttribute("data-dsp-node");
      if (!id) return;
      // 不让组件自己的按下操作（选文字、聚焦等）发生
      event.preventDefault();
      press = { id, x: event.clientX, y: event.clientY };
    },
    true
  );
  doc.addEventListener("pointermove", (event) => {
    if (!press) return;
    if (!dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5) return;
    dragging = true;
    doc.body.style.cursor = "grabbing";
    targetAt(event.clientY, doc.elementFromPoint(event.clientX, event.clientY), press.id);
  });
  const endPress = (event: PointerEvent, drop: boolean) => {
    if (press && dragging && drop) {
      const target = targetAt(
        event.clientY,
        doc.elementFromPoint(event.clientX, event.clientY),
        press.id
      );
      post({ node: press.id, target, type: "dsp:drop" });
      swallowClick = true;
    }
    press = undefined;
    dragging = false;
    doc.body.style.cursor = "";
    indicator.style.display = "none";
  };
  doc.addEventListener("pointerup", (event) => endPress(event, true));
  doc.addEventListener("pointercancel", (event) => endPress(event, false));

  // 画布上点组件是选中，不触发组件自己的操作（按钮、链接等）
  doc.addEventListener(
    "click",
    (event) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      const element = (event.target as Element | null)?.closest?.("[data-dsp-node]");
      post({ id: element?.getAttribute("data-dsp-node") ?? null, type: "dsp:select" });
    },
    true
  );
  doc.addEventListener("dragover", (event) => {
    if (!enabled || !isOurDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    targetAt(event.clientY, event.target as Element | null);
  });
  doc.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) indicator.style.display = "none";
  });
  doc.addEventListener("drop", (event) => {
    if (!enabled || !isOurDrag(event)) return;
    event.preventDefault();
    const target = targetAt(event.clientY, event.target as Element | null);
    indicator.style.display = "none";
    const component = event.dataTransfer?.getData(DRAG_COMPONENT) || undefined;
    const node = event.dataTransfer?.getData(DRAG_NODE) || undefined;
    if (component || node) post({ component, node, target, type: "dsp:drop" });
  });
  // 焦点在画布里时，撤销、重做、删除交给界面
  doc.addEventListener("keydown", (event) => {
    if (!enabled) return;
    const key = event.key.toLowerCase();
    const mod = event.metaKey || event.ctrlKey;
    let action: "undo" | "redo" | "delete" | undefined;
    if (mod && key === "z") action = event.shiftKey ? "redo" : "undo";
    else if (mod && key === "y") action = "redo";
    else if (!mod && (key === "delete" || key === "backspace")) action = "delete";
    if (!action) return;
    event.preventDefault();
    post({ key: action, type: "dsp:key" });
  });
  const view = doc.defaultView;
  view?.addEventListener("resize", showSelection);
  view?.addEventListener("scroll", showSelection, true);

  return {
    /** 画布的内容渲染完以后：记下组件的位置关系，重新画选中的框 */
    show: (tree: TreeNode[], selectedId: string | undefined) => {
      enabled = true;
      selected = selectedId;
      rootCount = tree.length;
      nodes.clear();
      const walk = (list: TreeNode[], parent: string | null) => {
        list.forEach((node, index) => {
          nodes.set(node.id, {
            childCount: node.children.length,
            container: node.container,
            index,
            parent,
          });
          walk(node.children, node.id);
        });
      };
      walk(tree, null);
      doc.body.classList.add("dsp-canvas-mode");
      // 等浏览器排好版再量
      (view?.requestAnimationFrame ?? setTimeout)(showSelection);
    },
    /** 换成显示单个组件 */
    hide: () => {
      enabled = false;
      selection.style.display = "none";
      indicator.style.display = "none";
      doc.body.classList.remove("dsp-canvas-mode");
    },
  };
};
