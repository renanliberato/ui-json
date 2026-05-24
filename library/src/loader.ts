import { parseUIDocument } from "./parser";
import type { UIDocument } from "./types";

export async function loadUIDocument(url: string): Promise<UIDocument> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadUIDocument: HTTP ${res.status} for ${url}`);
  }
  const raw = await res.json();
  return parseUIDocument(raw);
}
