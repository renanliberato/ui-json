export {
  UI_SCHEMA_VERSION,
  type UIDesignSize,
  type UIDocument,
  type UINode,
  type UINodeType,
  type UISpriteRef,
} from "./types";

export { parseUIDocument, UIDocumentParseError } from "./parser";
export { loadUIDocument } from "./loader";
export {
  mountUI,
  type MountUIOptions,
  type UIInstance,
} from "./dom-renderer";
