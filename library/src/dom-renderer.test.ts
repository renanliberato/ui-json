import { describe, it, expect, beforeEach } from "bun:test";
import { JSDOM } from "jsdom";
import { mountUI } from "./dom-renderer";
import { SpriteSheet, type SpriteSheetData } from "easy-spritesheets";
import type { UIDocument } from "./types";

let dom: JSDOM;
let container: HTMLElement;
let sheet: SpriteSheet;

const sheetData: SpriteSheetData = {
  version: 1,
  image: "actions.png",
  size: { w: 256, h: 256 },
  frames: {
    "btn-primary": { x: 0, y: 0, w: 190, h: 64 },
  },
};

beforeEach(() => {
  dom = new JSDOM(
    "<!doctype html><body><div id='host' style='width:390px;height:844px;position:relative'></div></body>"
  );
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  container = dom.window.document.getElementById("host")!;
  sheet = new SpriteSheet(sheetData, {
    width: 256,
    height: 256,
  } as unknown as HTMLImageElement);
});

function doc(): UIDocument {
  return {
    version: 1,
    design: { w: 390, h: 844 },
    root: {
      id: "root",
      type: "div",
      x: 0,
      y: 0,
      w: 390,
      h: 844,
      children: [
        {
          id: "btn",
          type: "button",
          x: 100,
          y: 600,
          w: 190,
          h: 64,
          sprite: { sheet: "actions", name: "btn-primary" },
        },
      ],
    },
  };
}

describe("mountUI", () => {
  it("appends a single root to the container", () => {
    const ui = mountUI(doc(), container, { sheets: { actions: sheet } });
    expect(container.children.length).toBe(1);
    expect(ui.root.id).toBe("root");
  });

  it("renders the type as the HTML tag and id as HTML id", () => {
    const ui = mountUI(doc(), container, { sheets: { actions: sheet } });
    const btn = ui.getById("btn")!;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.id).toBe("btn");
    expect(ui.root.tagName).toBe("DIV");
  });

  it("positions nodes in percentages relative to their parent's design size", () => {
    const ui = mountUI(doc(), container, { sheets: { actions: sheet } });
    const btn = ui.getById("btn")!;
    expect(btn.style.position).toBe("absolute");
    // btn is a direct child of root (which equals the design viewport),
    // so parent-relative % == design-relative %.
    expect(btn.style.left).toBe("25.641%"); // 100/390
    expect(btn.style.top).toBe("71.09%"); // 600/844
    expect(btn.style.width).toBe("48.7179%"); // 190/390
    expect(btn.style.height).toBe("7.5829%"); // 64/844
  });

  it("positions deeply nested children relative to their immediate parent, not the document", () => {
    // Regression: dividing every node's coords by the document design viewport
    // made grandchildren shrink toward the top-left — CSS resolves
    // `position: absolute` percentages against the offset parent, so nested
    // percentages would otherwise compound the parent's scale factor.
    const d: UIDocument = {
      version: 1,
      design: { w: 390, h: 844 },
      root: {
        id: "root",
        type: "div",
        x: 0,
        y: 0,
        w: 390,
        h: 844,
        children: [
          {
            id: "panel",
            type: "div",
            x: 13,
            y: 158,
            w: 364,
            h: 550,
            children: [
              { id: "header", type: "div", x: 44, y: 0, w: 273, h: 53 },
            ],
          },
        ],
      },
    };
    const ui = mountUI(d, container, { sheets: {} });
    const panel = ui.getById("panel")!;
    const header = ui.getById("header")!;
    // panel: parent is root (390×844), so design-relative %.
    expect(panel.style.left).toBe("3.3333%"); // 13/390
    expect(panel.style.width).toBe("93.3333%"); // 364/390
    // header: parent is panel (364×550), NOT the document.
    expect(header.style.left).toBe("12.0879%"); // 44/364
    expect(header.style.top).toBe("0%");
    expect(header.style.width).toBe("75%"); // 273/364
    expect(header.style.height).toBe("9.6364%"); // 53/550
  });

  it("applies sprite as scaled background so the named frame fills the element", () => {
    const ui = mountUI(doc(), container, { sheets: { actions: sheet } });
    const btn = ui.getById("btn")!;
    expect(btn.style.backgroundImage).toBe('url("actions.png")');
    expect(btn.style.backgroundRepeat).toBe("no-repeat");
    // sheet 256x256, frame btn-primary 190x64 at (0,0).
    // bgW = 256/190*100 ≈ 134.74%, bgH = 256/64*100 = 400%.
    // bgPos: frame at (0,0) → 0%, 0%.
    expect(btn.style.backgroundSize.startsWith("134.")).toBe(true);
    expect(btn.style.backgroundSize.endsWith("400%")).toBe(true);
    expect(btn.style.backgroundPosition).toBe("0% 0%");
  });

  it("positions the background correctly for frames not at (0,0)", () => {
    // Regression: the naive `-frame.x/size.w * bgW%` math sent non-origin
    // frames off-screen because CSS % positions are (container − image) × p,
    // not "shift by N% of the image".
    const offsetData: SpriteSheetData = {
      version: 1,
      image: "decks.webp",
      size: { w: 512, h: 1024 },
      frames: {
        // mimic deck-saloon-back from the real decks sheet
        saloon: { x: 198, y: 313, w: 198, h: 309 },
      },
    };
    const offsetSheet = new SpriteSheet(offsetData, {
      width: 512,
      height: 1024,
    } as unknown as HTMLImageElement);
    const d: UIDocument = {
      version: 1,
      design: { w: 390, h: 844 },
      root: {
        id: "r",
        type: "div",
        x: 0,
        y: 0,
        w: 390,
        h: 844,
        children: [
          {
            id: "s",
            type: "div",
            x: 0,
            y: 0,
            w: 198,
            h: 309,
            sprite: { sheet: "decks", name: "saloon" },
          },
        ],
      },
    };
    const ui = mountUI(d, container, { sheets: { decks: offsetSheet } });
    const s = ui.getById("s")!;
    // bgX % = 198 / (512-198) * 100 = 63.0573... → 63.0573
    // bgY % = 313 / (1024-309) * 100 = 43.7762... → 43.7762
    expect(s.style.backgroundPosition).toBe("63.0573% 43.7762%");
  });

  it("getById returns null for unknown ids", () => {
    const ui = mountUI(doc(), container, { sheets: { actions: sheet } });
    expect(ui.getById("nope")).toBeNull();
  });

  it("unmount removes the root from the container", () => {
    const ui = mountUI(doc(), container, { sheets: { actions: sheet } });
    ui.unmount();
    expect(container.children.length).toBe(0);
  });

  it("throws when a sprite references an unknown sheet", () => {
    const bad: UIDocument = {
      ...doc(),
      root: {
        id: "r",
        type: "div",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        children: [
          {
            id: "x",
            type: "div",
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            sprite: { sheet: "missing", name: "btn-primary" },
          },
        ],
      },
    };
    expect(() => mountUI(bad, container, { sheets: {} })).toThrow(/missing/);
  });
});
