#!/usr/bin/env node
// Scan a spritesheets directory and write index.json (the manifest the
// editor reads on launch). No list to maintain — just rerun this any time
// you add or rename a sheet.
//
// Usage:
//   node editor/sync-sheets-index.mjs
//     → scans editor/spritesheets/ (the default symlink target)
//
//   node editor/sync-sheets-index.mjs <dir>
//     → scans <dir> (resolved from cwd)

import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const dir = resolve(process.argv[2] || join(here, "spritesheets"));

if (!existsSync(dir)) {
  console.error(`[ui-editor] sheets dir not found: ${dir}`);
  process.exit(1);
}

const entries = readdirSync(dir);
const names = entries
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => f.replace(/\.json$/i, ""))
  // Keep only sheets that have a sibling image
  .filter((name) => {
    const exts = [".webp", ".png", ".jpg", ".jpeg"];
    return exts.some((ext) =>
      existsSync(join(dir, name + ext)) &&
      statSync(join(dir, name + ext)).isFile()
    );
  })
  .sort();

const indexPath = join(dir, "index.json");
writeFileSync(indexPath, JSON.stringify(names, null, 2) + "\n");
console.log(`[ui-editor] wrote ${indexPath} (${names.length} sheets)`);
for (const n of names) console.log(`  ${n}`);
