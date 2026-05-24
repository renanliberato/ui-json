// UI Editor — vanilla browser app, no build step. Sister to the
// easy-spritesheets editor.

import { loadConfiguredSheets, loadSheetsFromFolder } from "./sheets.js";

const SCHEMA_VERSION = 1;
const DEFAULT_DESIGN = { w: 390, h: 844 };
const HISTORY_LIMIT = 100;
const MIN_SIZE = 1;

// ─── State ───────────────────────────────────────────────────────────────
const state = {
  doc: emptyDoc(),
  selectedId: null,
  sheets: new Map(),        // name -> { data, imageUrl, image }
  snap: true,
  drag: null,               // active interaction (move/resize/tree)
};

const history = { undo: [], redo: [] };
let pendingSnapshot = null;

function emptyDoc() {
  return {
    version: SCHEMA_VERSION,
    design: { ...DEFAULT_DESIGN },
    root: {
      id: "root",
      type: "div",
      x: 0,
      y: 0,
      w: DEFAULT_DESIGN.w,
      h: DEFAULT_DESIGN.h,
      children: [],
    },
  };
}

// ─── Validator (mirror of src/ui/parser.ts, JS-only) ─────────────────────
function validateUIDocument(input) {
  if (!isObj(input)) fail("UI document must be an object");
  if (input.version !== SCHEMA_VERSION) fail(`unsupported version ${input.version}`);
  if (!isObj(input.design)) fail("design must be an object");
  const designW = mustNum(input.design.w, "design.w");
  const designH = mustNum(input.design.h, "design.h");
  const seen = new Set();
  const root = validateNode(input.root, "root", seen);
  const doc = {
    version: SCHEMA_VERSION,
    design: { w: designW, h: designH },
    root,
  };
  if (input.meta !== undefined) {
    if (!isObj(input.meta)) fail("meta must be an object");
    doc.meta = input.meta;
  }
  return doc;
}
function validateNode(raw, path, seen) {
  if (!isObj(raw)) fail(`${path} must be an object`);
  if (typeof raw.id !== "string" || !raw.id) fail(`${path}.id must be non-empty string`);
  if (seen.has(raw.id)) fail(`duplicate id "${raw.id}"`);
  seen.add(raw.id);
  if (raw.type !== "div" && raw.type !== "button") fail(`${path}.type must be div or button`);
  const node = {
    id: raw.id,
    type: raw.type,
    x: mustNum(raw.x, `${path}.x`, true),
    y: mustNum(raw.y, `${path}.y`, true),
    w: mustNum(raw.w, `${path}.w`),
    h: mustNum(raw.h, `${path}.h`),
  };
  if (raw.sprite !== undefined) {
    if (!isObj(raw.sprite)) fail(`${path}.sprite must be object`);
    if (typeof raw.sprite.sheet !== "string" || !raw.sprite.sheet) fail(`${path}.sprite.sheet must be non-empty string`);
    if (typeof raw.sprite.name !== "string" || !raw.sprite.name) fail(`${path}.sprite.name must be non-empty string`);
    node.sprite = { sheet: raw.sprite.sheet, name: raw.sprite.name };
  }
  if (raw.children !== undefined) {
    if (!Array.isArray(raw.children)) fail(`${path}.children must be array`);
    node.children = raw.children.map((c, i) => validateNode(c, `${path}.children[${i}]`, seen));
  }
  return node;
}
function isObj(v) { return typeof v === "object" && v !== null && !Array.isArray(v); }
function mustNum(v, label, allowNeg = false) {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${label} must be a finite number`);
  if (!allowNeg && v < 0) fail(`${label} must be >= 0`);
  return v;
}
function fail(msg) { const e = new Error(msg); e.name = "UIDocumentParseError"; throw e; }

// ─── Tree helpers ─────────────────────────────────────────────────────────
function findNode(doc, id) {
  return walkFind(doc.root, id);
}
function walkFind(node, id) {
  if (node.id === id) return node;
  if (!node.children) return null;
  for (const c of node.children) {
    const r = walkFind(c, id);
    if (r) return r;
  }
  return null;
}
function findParent(doc, id) {
  return walkFindParent(doc.root, id);
}
function walkFindParent(node, id) {
  if (!node.children) return null;
  for (const c of node.children) {
    if (c.id === id) return node;
    const r = walkFindParent(c, id);
    if (r) return r;
  }
  return null;
}
function isDescendant(node, candidateAncestorId) {
  let cur = node;
  // Walk via parent lookup
  while (cur) {
    if (cur.id === candidateAncestorId) return true;
    cur = findParent(state.doc, cur.id);
  }
  return false;
}
function allIds(doc) {
  const out = [];
  walkAll(doc.root, (n) => out.push(n.id));
  return out;
}
function walkAll(node, fn) {
  fn(node);
  if (node.children) for (const c of node.children) walkAll(c, fn);
}
function deepClone(doc) {
  return JSON.parse(JSON.stringify(doc));
}
function nextId(base) {
  const ids = new Set(allIds(state.doc));
  if (!ids.has(base)) return base;
  for (let i = 1; i < 10000; i++) {
    const candidate = `${base}-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
function snapVal(n) {
  return state.snap ? Math.round(n) : n;
}

// ─── History ─────────────────────────────────────────────────────────────
function snapshot() {
  return { doc: deepClone(state.doc), selectedId: state.selectedId };
}
function restore(snap) {
  state.doc = deepClone(snap.doc);
  state.selectedId = snap.selectedId;
  pendingSnapshot = null;
  renderAll();
}
function pushHistory(snap) {
  history.undo.push(snap);
  if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
  history.redo.length = 0;
}
function capturePending() {
  if (!pendingSnapshot) pendingSnapshot = snapshot();
}
function commitPending() {
  if (pendingSnapshot) {
    pushHistory(pendingSnapshot);
    pendingSnapshot = null;
  }
}
function discardPending() {
  pendingSnapshot = null;
}
function snapshotAndPush() {
  pushHistory(snapshot());
}
function undo() {
  commitPending();
  if (history.undo.length === 0) return;
  const cur = snapshot();
  const prev = history.undo.pop();
  history.redo.push(cur);
  restore(prev);
}
function redo() {
  if (history.redo.length === 0) return;
  const cur = snapshot();
  const next = history.redo.pop();
  history.undo.push(cur);
  restore(next);
}
function clearHistory() {
  history.undo.length = 0;
  history.redo.length = 0;
  pendingSnapshot = null;
}

// ─── Rendering ───────────────────────────────────────────────────────────
function renderAll() {
  renderStage();
  renderTree();
  renderProperties();
}

const LIBRARY_COLLAPSE_KEY = "ui-editor.library.collapsed";
function loadCollapsedSheets() {
  try {
    const raw = localStorage.getItem(LIBRARY_COLLAPSE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function saveCollapsedSheets(set) {
  try {
    localStorage.setItem(LIBRARY_COLLAPSE_KEY, JSON.stringify([...set]));
  } catch {}
}

function renderLibrary() {
  const root = document.getElementById("library");
  root.innerHTML = "";
  const search = document.getElementById("library-search").value.toLowerCase();
  const collapsed = loadCollapsedSheets();
  // A search query auto-expands every section that has any matches so the
  // user sees the results without having to expand things by hand.
  const searching = search.length > 0;

  for (const [sheetName, sheet] of state.sheets) {
    const matchingFrames = Object.keys(sheet.data.frames).filter((frameName) =>
      !search ||
      frameName.toLowerCase().includes(search) ||
      sheetName.toLowerCase().includes(search)
    );
    if (matchingFrames.length === 0) continue;

    const isCollapsed = !searching && collapsed.has(sheetName);

    const section = document.createElement("section");
    section.className = "library-section" + (isCollapsed ? " collapsed" : "");
    section.dataset.sheet = sheetName;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "library-header";
    header.setAttribute("aria-expanded", String(!isCollapsed));
    header.innerHTML =
      `<span class="caret">${isCollapsed ? "▶" : "▼"}</span>` +
      `<span class="title">${escapeHtml(sheetName)}</span>` +
      `<span class="count">${matchingFrames.length}</span>`;
    header.addEventListener("click", () => {
      const cur = loadCollapsedSheets();
      if (cur.has(sheetName)) cur.delete(sheetName);
      else cur.add(sheetName);
      saveCollapsedSheets(cur);
      renderLibrary();
    });
    section.appendChild(header);

    if (!isCollapsed) {
      const grid = document.createElement("div");
      grid.className = "library-grid";
      for (const frameName of matchingFrames) {
        grid.appendChild(spriteThumbnail(sheetName, frameName, sheet));
      }
      section.appendChild(grid);
    }
    root.appendChild(section);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

function spriteThumbnail(sheetName, frameName, sheet) {
  const f = sheet.data.frames[frameName];
  const { size, image } = sheet.data;
  const THUMB = 64;
  const scale = Math.min(THUMB / f.w, THUMB / f.h);
  const el = document.createElement("div");
  el.className = "library-thumb";
  el.title = `${sheetName}/${frameName}\n${f.w}×${f.h}`;
  el.draggable = true;
  el.style.width = `${f.w * scale}px`;
  el.style.height = `${f.h * scale}px`;
  el.style.backgroundImage = `url("${sheet.imageUrl}")`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.backgroundSize = `${size.w * scale}px ${size.h * scale}px`;
  el.style.backgroundPosition = `${-f.x * scale}px ${-f.y * scale}px`;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData(
      "application/x-ui-sprite",
      JSON.stringify({ sheet: sheetName, name: frameName, w: f.w, h: f.h })
    );
    e.dataTransfer.effectAllowed = "copy";
  });
  return el;
}

// ── Stage ──
function renderStage() {
  const frame = document.getElementById("stage-frame");
  frame.innerHTML = "";
  // Resize the frame to the doc's design size (in case it's not 390x844).
  frame.style.width = `${state.doc.design.w}px`;
  frame.style.height = `${state.doc.design.h}px`;
  // Render children of root directly into the frame so root itself doesn't
  // catch every click. Root metadata is implicit.
  for (const child of state.doc.root.children || []) {
    frame.appendChild(buildStageNode(child));
  }
  if (state.selectedId) {
    const sel = frame.querySelector(`[data-node-id="${cssEscape(state.selectedId)}"]`);
    if (sel) {
      sel.classList.add("selected");
      addHandles(sel);
    }
  }
}

function buildStageNode(node) {
  const el = document.createElement(node.type);
  el.className = "ui-node" + (node.type === "button" ? " ui-node--button" : "");
  el.dataset.nodeId = node.id;
  el.style.position = "absolute";
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.w}px`;
  el.style.height = `${node.h}px`;
  el.style.boxSizing = "border-box";
  if (node.sprite) {
    const sheet = state.sheets.get(node.sprite.sheet);
    if (sheet) applySpriteBg(el, sheet, node.sprite.name);
  }
  if (node.children) {
    for (const c of node.children) el.appendChild(buildStageNode(c));
  }
  return el;
}

function applySpriteBg(el, sheet, frameName) {
  const f = sheet.data.frames[frameName];
  if (!f) return;
  const { size } = sheet.data;
  // Scale the sheet so one frame == 100% of the element. Then position it
  // so that frame lands at (0,0) inside the element.
  // CSS background-position % is interpreted as (container − image) × p,
  // so the right percent that puts pixel f.x at element-x=0 is:
  //   p = f.x / (size.w − f.w)  (when the sheet is bigger than the frame)
  // and 0 when the frame already fills the sheet on that axis.
  const bgW = (size.w / f.w) * 100;
  const bgH = (size.h / f.h) * 100;
  const px = size.w > f.w ? (f.x / (size.w - f.w)) * 100 : 0;
  const py = size.h > f.h ? (f.y / (size.h - f.h)) * 100 : 0;
  el.style.backgroundImage = `url("${sheet.imageUrl}")`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.backgroundSize = `${bgW}% ${bgH}%`;
  el.style.backgroundPosition = `${px}% ${py}%`;
}

function addHandles(el) {
  for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const h = document.createElement("div");
    h.className = `handle ${dir}`;
    h.dataset.handle = dir;
    el.appendChild(h);
  }
}

// ── Tree ──
function renderTree() {
  const treeRoot = document.getElementById("tree");
  treeRoot.innerHTML = "";
  const ul = document.createElement("ul");
  for (const child of state.doc.root.children || []) {
    ul.appendChild(buildTreeItem(child));
  }
  treeRoot.appendChild(ul);
}
function buildTreeItem(node) {
  const li = document.createElement("li");
  li.dataset.nodeId = node.id;
  li.draggable = true;
  if (state.selectedId === node.id) li.classList.add("selected");
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = node.id;
  li.appendChild(label);
  const tag = document.createElement("span");
  tag.className = "type-tag";
  tag.textContent = node.type;
  li.appendChild(tag);
  if (node.children && node.children.length) {
    const ul = document.createElement("ul");
    for (const c of node.children) ul.appendChild(buildTreeItem(c));
    li.appendChild(ul);
  }
  return li;
}

// ── Properties ──
function renderProperties() {
  const panel = document.getElementById("properties");
  const node = state.selectedId ? findNode(state.doc, state.selectedId) : null;
  if (!node || node.id === "root") {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  setVal("props-id", node.id);
  setVal("props-type", node.type);
  setVal("props-x", node.x);
  setVal("props-y", node.y);
  setVal("props-w", node.w);
  setVal("props-h", node.h);
  document.getElementById("props-sprite").textContent =
    node.sprite ? `${node.sprite.sheet} / ${node.sprite.name}` : "—";
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (document.activeElement === el) return; // don't clobber while typing
  el.value = v;
}

function updateStatus(msg) {
  document.getElementById("status-line").textContent = msg;
}

// ─── Selection ───────────────────────────────────────────────────────────
function select(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  renderAll();
}

// ─── Stage interaction ───────────────────────────────────────────────────
function setupStageInteraction() {
  const frame = document.getElementById("stage-frame");

  frame.addEventListener("mousedown", (e) => {
    const handleEl = e.target.closest(".handle");
    if (handleEl) {
      const nodeEl = handleEl.parentElement;
      const id = nodeEl.dataset.nodeId;
      startResize(id, handleEl.dataset.handle, e);
      return;
    }
    const nodeEl = e.target.closest("[data-node-id]");
    if (nodeEl && nodeEl !== frame) {
      const id = nodeEl.dataset.nodeId;
      if (state.selectedId !== id) select(id);
      startMove(id, e);
      return;
    }
    // clicked empty space
    select(null);
  });

  // Drag and drop from sprite library
  frame.addEventListener("dragover", (e) => {
    if (Array.from(e.dataTransfer.types).includes("application/x-ui-sprite")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  frame.addEventListener("drop", (e) => {
    const raw = e.dataTransfer.getData("application/x-ui-sprite");
    if (!raw) return;
    e.preventDefault();
    const payload = JSON.parse(raw);
    const rect = frame.getBoundingClientRect();
    let x = e.clientX - rect.left - payload.w / 2;
    let y = e.clientY - rect.top - payload.h / 2;
    x = snapVal(Math.max(0, x));
    y = snapVal(Math.max(0, y));
    snapshotAndPush();
    const id = nextId(payload.name);
    const newNode = {
      id,
      type: "div",
      x,
      y,
      w: payload.w,
      h: payload.h,
      sprite: { sheet: payload.sheet, name: payload.name },
    };
    const parent = pickInsertParent();
    parent.children = parent.children || [];
    parent.children.push(newNode);
    state.selectedId = id;
    renderAll();
    updateStatus(`Added ${id}`);
  });
}

function pickInsertParent() {
  // Insert as child of the selected node if it's a container (any div).
  // Otherwise as child of root.
  if (state.selectedId && state.selectedId !== "root") {
    const sel = findNode(state.doc, state.selectedId);
    if (sel && sel.type === "div") return sel;
  }
  return state.doc.root;
}

function startMove(id, ev) {
  const node = findNode(state.doc, id);
  if (!node) return;
  const start = { x: ev.clientX, y: ev.clientY, nx: node.x, ny: node.y };
  capturePending();
  let moved = false;
  state.drag = { type: "move", id };

  const onMove = (e) => {
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) moved = true;
    node.x = snapVal(Math.max(0, start.nx + dx));
    node.y = snapVal(Math.max(0, start.ny + dy));
    renderStage();
    renderProperties();
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    state.drag = null;
    if (moved) commitPending();
    else discardPending();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function startResize(id, dir, ev) {
  const node = findNode(state.doc, id);
  if (!node) return;
  const start = {
    mx: ev.clientX, my: ev.clientY,
    x: node.x, y: node.y, w: node.w, h: node.h,
  };
  const aspect = start.w / Math.max(1, start.h);
  capturePending();
  let moved = false;
  state.drag = { type: "resize", id, dir };

  const onMove = (e) => {
    const dx = e.clientX - start.mx;
    const dy = e.clientY - start.my;
    if (!moved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) moved = true;

    let x = start.x, y = start.y, w = start.w, h = start.h;
    if (dir.includes("e")) w = start.w + dx;
    if (dir.includes("s")) h = start.h + dy;
    if (dir.includes("w")) { x = start.x + dx; w = start.w - dx; }
    if (dir.includes("n")) { y = start.y + dy; h = start.h - dy; }

    // Symmetric resize (Ctrl/Cmd): mirror the delta on the opposite side.
    if (e.ctrlKey || e.metaKey) {
      if (dir.includes("e")) { x = start.x - dx; w = start.w + 2 * dx; }
      if (dir.includes("w")) { x = start.x + dx; w = start.w - 2 * dx; }
      if (dir.includes("s")) { y = start.y - dy; h = start.h + 2 * dy; }
      if (dir.includes("n")) { y = start.y + dy; h = start.h - 2 * dy; }
    }

    // Shift = preserve aspect ratio (drive the smaller axis from the larger).
    if (e.shiftKey) {
      if (Math.abs(w - start.w) >= Math.abs(h - start.h)) {
        const newH = w / aspect;
        if (dir.includes("n")) y = start.y + (start.h - newH);
        h = newH;
      } else {
        const newW = h * aspect;
        if (dir.includes("w")) x = start.x + (start.w - newW);
        w = newW;
      }
    }

    if (w < MIN_SIZE) w = MIN_SIZE;
    if (h < MIN_SIZE) h = MIN_SIZE;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }

    node.x = snapVal(x);
    node.y = snapVal(y);
    node.w = snapVal(w);
    node.h = snapVal(h);
    renderStage();
    renderProperties();
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    state.drag = null;
    if (moved) commitPending();
    else discardPending();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ─── Keyboard ────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    // Don't hijack while typing in a field
    const t = e.target;
    const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

    // Undo/redo always available
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (meta && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }

    if (inField) return;

    if (e.key === "Escape") {
      select(null);
      return;
    }

    if (!state.selectedId || state.selectedId === "root") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    let dx = 0, dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    if (dx || dy) {
      e.preventDefault();
      const node = findNode(state.doc, state.selectedId);
      if (!node) return;
      snapshotAndPush();
      node.x = Math.max(0, node.x + dx);
      node.y = Math.max(0, node.y + dy);
      renderStage();
      renderProperties();
    }
  });
}

function deleteSelected() {
  if (!state.selectedId || state.selectedId === "root") return;
  const parent = findParent(state.doc, state.selectedId);
  if (!parent || !parent.children) return;
  const idx = parent.children.findIndex((c) => c.id === state.selectedId);
  if (idx < 0) return;
  snapshotAndPush();
  parent.children.splice(idx, 1);
  state.selectedId = null;
  renderAll();
}

// ─── Tree interaction ────────────────────────────────────────────────────
function setupTreeInteraction() {
  const treeRoot = document.getElementById("tree");

  treeRoot.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-node-id]");
    if (!li) return;
    select(li.dataset.nodeId);
  });

  treeRoot.addEventListener("dblclick", (e) => {
    const li = e.target.closest("li[data-node-id]");
    if (!li) return;
    startRename(li);
  });

  // Drag to reorder/reparent
  let dragSrcId = null;
  treeRoot.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-node-id]");
    if (!li) return;
    dragSrcId = li.dataset.nodeId;
    e.dataTransfer.setData("application/x-ui-node", dragSrcId);
    e.dataTransfer.effectAllowed = "move";
  });
  treeRoot.addEventListener("dragover", (e) => {
    if (!Array.from(e.dataTransfer.types).includes("application/x-ui-node")) return;
    const li = e.target.closest("li[data-node-id]");
    if (!li) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    treeRoot.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach((n) =>
      n.classList.remove("drop-before", "drop-after", "drop-into")
    );
    const pos = dropPositionOf(li, e);
    li.classList.add(pos);
  });
  treeRoot.addEventListener("dragleave", () => {
    treeRoot.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach((n) =>
      n.classList.remove("drop-before", "drop-after", "drop-into")
    );
  });
  treeRoot.addEventListener("drop", (e) => {
    const srcId = e.dataTransfer.getData("application/x-ui-node");
    treeRoot.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach((n) =>
      n.classList.remove("drop-before", "drop-after", "drop-into")
    );
    if (!srcId) return;
    const li = e.target.closest("li[data-node-id]");
    if (!li) return;
    const targetId = li.dataset.nodeId;
    if (srcId === targetId) return;
    e.preventDefault();
    const pos = dropPositionOf(li, e);
    moveNodeInTree(srcId, targetId, pos);
  });
}

function dropPositionOf(li, e) {
  const rect = li.getBoundingClientRect();
  const y = e.clientY - rect.top;
  if (y < rect.height * 0.25) return "drop-before";
  if (y > rect.height * 0.75) return "drop-after";
  return "drop-into";
}

function moveNodeInTree(srcId, targetId, pos) {
  // Disallow dropping a node into its own descendant.
  const targetNode = findNode(state.doc, targetId);
  const srcNode = findNode(state.doc, srcId);
  if (!targetNode || !srcNode) return;
  if (isAncestor(srcNode, targetId)) return;

  snapshotAndPush();
  // Remove src from its parent.
  const srcParent = findParent(state.doc, srcId);
  if (!srcParent || !srcParent.children) return;
  const srcIdx = srcParent.children.findIndex((c) => c.id === srcId);
  if (srcIdx < 0) return;
  srcParent.children.splice(srcIdx, 1);

  if (pos === "drop-into") {
    if (targetNode.type !== "div") {
      // buttons can't host children — fall back to "after"
      pos = "drop-after";
    } else {
      targetNode.children = targetNode.children || [];
      targetNode.children.push(srcNode);
      renderAll();
      return;
    }
  }
  const targetParent = findParent(state.doc, targetId);
  if (!targetParent || !targetParent.children) return;
  let targetIdx = targetParent.children.findIndex((c) => c.id === targetId);
  if (pos === "drop-after") targetIdx++;
  targetParent.children.splice(targetIdx, 0, srcNode);
  renderAll();
}

function isAncestor(node, candidateDescendantId) {
  if (!node.children) return false;
  for (const c of node.children) {
    if (c.id === candidateDescendantId) return true;
    if (isAncestor(c, candidateDescendantId)) return true;
  }
  return false;
}

function startRename(li) {
  const node = findNode(state.doc, li.dataset.nodeId);
  if (!node || node.id === "root") return;
  const oldId = node.id;
  const label = li.querySelector(".label");
  const input = document.createElement("input");
  input.className = "rename";
  input.type = "text";
  input.value = oldId;
  label.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newId = input.value.trim();
    cleanup();
    if (!newId || newId === oldId) return;
    // Validate uniqueness
    const ids = new Set(allIds(state.doc));
    ids.delete(oldId);
    if (ids.has(newId)) {
      updateStatus(`id "${newId}" already used`);
      return;
    }
    snapshotAndPush();
    node.id = newId;
    if (state.selectedId === oldId) state.selectedId = newId;
    renderAll();
  };
  const cancel = () => cleanup();
  function cleanup() {
    input.removeEventListener("blur", commit);
    input.removeEventListener("keydown", onKey);
    renderTree();
  }
  function onKey(e) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  }
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", onKey);
}

// ─── Properties interaction ───────────────────────────────────────────────
function setupPropertiesInteraction() {
  // id rename via field
  const idInp = document.getElementById("props-id");
  idInp.addEventListener("focus", capturePending);
  idInp.addEventListener("blur", () => {
    if (!state.selectedId) return discardPending();
    const node = findNode(state.doc, state.selectedId);
    if (!node) return discardPending();
    const newId = idInp.value.trim();
    if (!newId || newId === node.id) return discardPending();
    const ids = new Set(allIds(state.doc));
    ids.delete(node.id);
    if (ids.has(newId)) {
      idInp.classList.add("invalid");
      updateStatus(`id "${newId}" already used`);
      discardPending();
      idInp.value = node.id;
      return;
    }
    idInp.classList.remove("invalid");
    commitPending();
    const oldId = node.id;
    node.id = newId;
    if (state.selectedId === oldId) state.selectedId = newId;
    renderAll();
  });

  // type toggle
  document.getElementById("props-type").addEventListener("change", (e) => {
    if (!state.selectedId) return;
    const node = findNode(state.doc, state.selectedId);
    if (!node) return;
    snapshotAndPush();
    node.type = e.target.value;
    renderAll();
  });

  // x/y/w/h numeric inputs
  for (const [id, key] of [["props-x", "x"], ["props-y", "y"], ["props-w", "w"], ["props-h", "h"]]) {
    const inp = document.getElementById(id);
    inp.addEventListener("focus", capturePending);
    inp.addEventListener("input", () => {
      if (!state.selectedId) return;
      const node = findNode(state.doc, state.selectedId);
      if (!node) return;
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      if ((key === "w" || key === "h") && v < MIN_SIZE) return;
      if ((key === "x" || key === "y") && v < 0) return;
      node[key] = v;
      renderStage();
    });
    inp.addEventListener("blur", commitPending);
  }

  // Sprite clear
  document.getElementById("props-sprite-clear").addEventListener("click", () => {
    if (!state.selectedId) return;
    const node = findNode(state.doc, state.selectedId);
    if (!node || !node.sprite) return;
    snapshotAndPush();
    delete node.sprite;
    renderAll();
  });
}

// ─── Toolbar wiring ──────────────────────────────────────────────────────
function setupToolbar() {
  document.getElementById("btn-new").addEventListener("click", () => {
    if ((state.doc.root.children || []).length > 0) {
      if (!confirm("Discard current document?")) return;
    }
    state.doc = emptyDoc();
    state.selectedId = null;
    clearHistory();
    renderAll();
    updateStatus("New document");
  });

  document.getElementById("open-json").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = "";
    try {
      const parsed = validateUIDocument(JSON.parse(text));
      state.doc = parsed;
      state.selectedId = null;
      clearHistory();
      renderAll();
      updateStatus(`Loaded ${file.name}`);
    } catch (err) {
      console.error(err);
      updateStatus(`Failed to load: ${err.message}`);
    }
  });

  document.getElementById("btn-save").addEventListener("click", () => {
    saveDoc();
  });

  document.getElementById("btn-reload-sheets").addEventListener("click", async () => {
    await reloadSheets();
  });

  document.getElementById("add-folder").addEventListener("change", async (e) => {
    const files = e.target.files;
    e.target.value = "";
    const extra = await loadSheetsFromFolder(files);
    for (const [name, sheet] of extra) state.sheets.set(name, sheet);
    renderLibrary();
    updateStatus(`Loaded ${extra.size} extra sheets`);
  });

  document.getElementById("snap-toggle").addEventListener("change", (e) => {
    state.snap = e.target.checked;
  });

  document.getElementById("library-search").addEventListener("input", renderLibrary);

  document.getElementById("btn-add-node").addEventListener("click", () => {
    snapshotAndPush();
    const parent = pickInsertParent();
    parent.children = parent.children || [];
    const id = nextId("node");
    parent.children.push({ id, type: "div", x: 50, y: 50, w: 100, h: 40 });
    state.selectedId = id;
    renderAll();
  });
}

function saveDoc() {
  const blob = new Blob([JSON.stringify(state.doc, null, 2)], { type: "application/json" });
  if (window.showSaveFilePicker) {
    saveViaPicker(blob).catch((err) => {
      if (err.name !== "AbortError") {
        console.error(err);
        downloadBlob(blob, defaultFilename());
      }
    });
  } else {
    downloadBlob(blob, defaultFilename());
  }
}
async function saveViaPicker(blob) {
  const handle = await window.showSaveFilePicker({
    suggestedName: defaultFilename(),
    types: [{ description: "UI Document", accept: { "application/json": [".json"] } }],
  });
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
  updateStatus(`Saved ${handle.name}`);
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  updateStatus(`Downloaded ${name}`);
}
function defaultFilename() {
  return "ui.json";
}

// ─── Boot ────────────────────────────────────────────────────────────────
async function reloadSheets() {
  updateStatus("Loading spritesheets…");
  try {
    state.sheets = await loadConfiguredSheets();
    renderLibrary();
    updateStatus(`Loaded ${state.sheets.size} spritesheets`);
  } catch (err) {
    console.error(err);
    updateStatus(`Failed to load spritesheets: ${err.message}`);
  }
  // Re-render stage in case existing nodes reference newly-loaded sheets.
  renderStage();
}

async function init() {
  setupStageInteraction();
  setupTreeInteraction();
  setupPropertiesInteraction();
  setupToolbar();
  setupKeyboard();
  await reloadSheets();
  renderAll();
  window.editorReady = true;
}

// Test hooks consumed by tools/ui-editor/test-roundtrip.mjs
window.editor = {
  setDoc(doc) { state.doc = validateUIDocument(doc); state.selectedId = null; clearHistory(); renderAll(); },
  serialize() { return JSON.stringify(state.doc, null, 2); },
  loadJSON(text) { state.doc = validateUIDocument(JSON.parse(text)); state.selectedId = null; clearHistory(); renderAll(); },
  getState() { return state; },
};

function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

document.addEventListener("DOMContentLoaded", init);
