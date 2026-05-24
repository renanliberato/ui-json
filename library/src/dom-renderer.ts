import type { SpriteSheet } from "easy-spritesheets";
import type { UIDocument, UINode } from "./types";

export interface MountUIOptions {
  sheets: Record<string, SpriteSheet>;
}

export interface UIInstance {
  root: HTMLElement;
  getById(id: string): HTMLElement | null;
  unmount(): void;
}

function tagFor(type: UINode["type"]): string {
  return type === "button" ? "button" : "div";
}

function pct(n: number): string {
  // Trim to 4 decimals; strip trailing zeros so "25%" stays "25%".
  return `${parseFloat(n.toFixed(4))}%`;
}

function applyBaseStyles(
  el: HTMLElement,
  node: UINode,
  parentSize: { w: number; h: number }
): void {
  // CSS `position: absolute` percentages resolve against the offset parent,
  // so node.x/y/w/h (design px relative to the parent's top-left) must be
  // divided by the *parent's* design size — not the document viewport —
  // otherwise nested children compound the parent's scale factor and drift
  // toward the top-left.
  el.style.position = "absolute";
  el.style.left = pct((node.x / parentSize.w) * 100);
  el.style.top = pct((node.y / parentSize.h) * 100);
  el.style.width = pct((node.w / parentSize.w) * 100);
  el.style.height = pct((node.h / parentSize.h) * 100);
  el.style.boxSizing = "border-box";

  if (el.tagName === "BUTTON") {
    el.style.border = "0";
    el.style.padding = "0";
    el.style.backgroundColor = "transparent";
    el.style.cursor = "pointer";
  }
}

function applySpriteBackground(
  el: HTMLElement,
  sheet: SpriteSheet,
  frameName: string
): void {
  const frame = sheet.getFrame(frameName);
  const { image, size } = sheet.data;
  // Scale the sheet so one frame == 100% of the element. Then position so
  // the frame lands at (0,0) inside the element. CSS background-position %
  // is `(container − image) × p`, which gives:
  //   p = frame.x / (size.w − frame.w)   when sheet is wider than the frame
  //   0                                  when the frame already fills the axis
  const bgW = (size.w / frame.w) * 100;
  const bgH = (size.h / frame.h) * 100;
  const px = size.w > frame.w ? (frame.x / (size.w - frame.w)) * 100 : 0;
  const py = size.h > frame.h ? (frame.y / (size.h - frame.h)) * 100 : 0;
  el.style.backgroundImage = `url("${image}")`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.backgroundSize = `${pct(bgW)} ${pct(bgH)}`;
  el.style.backgroundPosition = `${pct(px)} ${pct(py)}`;
}

function buildNode(
  node: UINode,
  parentSize: { w: number; h: number },
  sheets: Record<string, SpriteSheet>,
  index: Map<string, HTMLElement>
): HTMLElement {
  const el = document.createElement(tagFor(node.type));
  el.id = node.id;
  el.classList.add("ui-node");
  if (node.type === "button") el.classList.add("ui-node--button");
  applyBaseStyles(el, node, parentSize);

  if (node.sprite) {
    const sheet = sheets[node.sprite.sheet];
    if (!sheet) {
      throw new Error(
        `mountUI: missing sprite sheet "${node.sprite.sheet}" for node "${node.id}"`
      );
    }
    applySpriteBackground(el, sheet, node.sprite.name);
  }

  index.set(node.id, el);

  if (node.children) {
    const childParentSize = { w: node.w, h: node.h };
    for (const child of node.children) {
      el.appendChild(buildNode(child, childParentSize, sheets, index));
    }
  }
  return el;
}

export function mountUI(
  doc: UIDocument,
  container: HTMLElement,
  options: MountUIOptions
): UIInstance {
  const index = new Map<string, HTMLElement>();
  const root = buildNode(doc.root, doc.design, options.sheets, index);
  container.appendChild(root);
  return {
    root,
    getById(id) {
      return index.get(id) ?? null;
    },
    unmount() {
      root.remove();
    },
  };
}
