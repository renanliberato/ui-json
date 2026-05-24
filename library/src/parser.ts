import {
  UI_SCHEMA_VERSION,
  type UIDocument,
  type UINode,
  type UINodeType,
  type UISpriteRef,
} from "./types";

export class UIDocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UIDocumentParseError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new UIDocumentParseError(message);
}

function parseNumber(raw: unknown, label: string, allowNegative = false): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    fail(`${label} must be a finite number`);
  }
  if (!allowNegative && raw < 0) fail(`${label} must be >= 0`);
  return raw;
}

function parseSpriteRef(raw: unknown, label: string): UISpriteRef {
  if (!isPlainObject(raw)) fail(`${label} must be an object`);
  const { sheet, name } = raw;
  if (typeof sheet !== "string" || sheet.length === 0) {
    fail(`${label}.sheet must be a non-empty string`);
  }
  if (typeof name !== "string" || name.length === 0) {
    fail(`${label}.name must be a non-empty string`);
  }
  return { sheet, name };
}

function parseNode(raw: unknown, path: string, seenIds: Set<string>): UINode {
  if (!isPlainObject(raw)) fail(`${path} must be an object`);
  const { id, type, x, y, w, h, sprite, children } = raw;

  if (typeof id !== "string" || id.length === 0) {
    fail(`${path}.id must be a non-empty string`);
  }
  if (seenIds.has(id)) fail(`duplicate id "${id}"`);
  seenIds.add(id);

  if (type !== "div" && type !== "button") {
    fail(`${path}.type must be "div" or "button"`);
  }

  const node: UINode = {
    id,
    type: type as UINodeType,
    x: parseNumber(x, `${path}.x`, true),
    y: parseNumber(y, `${path}.y`, true),
    w: parseNumber(w, `${path}.w`),
    h: parseNumber(h, `${path}.h`),
  };

  if (sprite !== undefined) {
    node.sprite = parseSpriteRef(sprite, `${path}.sprite`);
  }

  if (children !== undefined) {
    if (!Array.isArray(children)) fail(`${path}.children must be an array`);
    node.children = children.map((c, i) =>
      parseNode(c, `${path}.children[${i}]`, seenIds)
    );
  }

  return node;
}

export function parseUIDocument(input: unknown): UIDocument {
  if (!isPlainObject(input)) fail("UI document must be an object");
  const { version, design, root, meta } = input;
  if (version !== UI_SCHEMA_VERSION) {
    fail(
      `unsupported version: got ${String(version)}, expected ${UI_SCHEMA_VERSION}`
    );
  }
  if (!isPlainObject(design)) fail("design must be an object with w, h");

  const designW = parseNumber(design.w, "design.w");
  const designH = parseNumber(design.h, "design.h");

  const doc: UIDocument = {
    version: 1,
    design: { w: designW, h: designH },
    root: parseNode(root, "root", new Set()),
  };
  if (meta !== undefined) {
    if (!isPlainObject(meta)) fail("meta must be an object if present");
    doc.meta = meta;
  }
  return doc;
}
