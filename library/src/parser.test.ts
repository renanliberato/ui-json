import { describe, it, expect } from "bun:test";
import { parseUIDocument, UIDocumentParseError } from "./parser";

function validDoc() {
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

describe("parseUIDocument", () => {
  it("parses a valid document", () => {
    const doc = parseUIDocument(validDoc());
    expect(doc.version).toBe(1);
    expect(doc.design).toEqual({ w: 390, h: 844 });
    expect(doc.root.id).toBe("root");
    expect(doc.root.children?.[0]?.sprite).toEqual({
      sheet: "actions",
      name: "btn-primary",
    });
  });

  it("rejects unknown version", () => {
    const bad = { ...validDoc(), version: 2 };
    expect(() => parseUIDocument(bad)).toThrow(UIDocumentParseError);
  });

  it("rejects duplicate ids anywhere in the tree", () => {
    const bad = validDoc();
    bad.root.children!.push({
      id: "btn",
      type: "div",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    } as any);
    expect(() => parseUIDocument(bad)).toThrow(/duplicate id/);
  });

  it("rejects unknown node type", () => {
    const bad = validDoc();
    (bad.root.children![0] as any).type = "input";
    expect(() => parseUIDocument(bad)).toThrow(/type/);
  });

  it("rejects empty or non-string id", () => {
    const bad = validDoc();
    (bad.root as any).id = "";
    expect(() => parseUIDocument(bad)).toThrow(/id/);
  });

  it("rejects negative width", () => {
    const bad = validDoc();
    (bad.root as any).w = -1;
    expect(() => parseUIDocument(bad)).toThrow(/w/);
  });

  it("passes through optional meta", () => {
    const input = { ...validDoc(), meta: { createdBy: "ui-editor" } };
    const doc = parseUIDocument(input);
    expect(doc.meta).toEqual({ createdBy: "ui-editor" });
  });
});
