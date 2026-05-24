export const UI_SCHEMA_VERSION = 1 as const;

export interface UISpriteRef {
  sheet: string;
  name: string;
}

export type UINodeType = "div" | "button";

export interface UINode {
  id: string;
  type: UINodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  sprite?: UISpriteRef;
  children?: UINode[];
}

export interface UIDesignSize {
  w: number;
  h: number;
}

export interface UIDocument {
  version: 1;
  design: UIDesignSize;
  root: UINode;
  meta?: Record<string, unknown>;
}
