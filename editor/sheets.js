// Spritesheet loading helpers for the UI editor.
// Returns a Map<name, { data, imageUrl, image }>.

// Tried in order. The first directory that yields any *.json hits wins.
// Override by editing editor/config.json (spritesheetsDir field).
const DEFAULT_DIRS = [
  "./spritesheets/",                       // editor served from editor/ with sheets here (or symlinked)
];

export async function loadConfiguredSheets() {
  let cfg = null;
  try {
    const res = await fetch("./config.json");
    if (res.ok) cfg = await res.json();
  } catch {
    // config is optional
  }

  const dirs = cfg && typeof cfg.spritesheetsDir === "string"
    ? [cfg.spritesheetsDir]
    : Array.isArray(cfg && cfg.spritesheetsDirs)
      ? cfg.spritesheetsDirs
      : DEFAULT_DIRS;

  for (const raw of dirs) {
    const dir = normalizeDir(raw);
    const names = await discoverSheetNames(dir);
    if (names.length === 0) continue;
    const sheets = new Map();
    for (const name of names) {
      try {
        const sheet = await loadSheet(`${dir}${name}.json`, dir);
        sheets.set(name, sheet);
      } catch (err) {
        console.warn(`[ui-editor] failed to load sheet "${name}":`, err);
      }
    }
    if (sheets.size > 0) return sheets;
  }

  console.warn(
    `[ui-editor] no sheets auto-discovered. Tried: ${JSON.stringify(dirs)}.\n` +
    `Either symlink sheets into editor/spritesheets/, edit config.json's spritesheetsDir, or click "Load other folder…".`
  );
  return new Map();
}

function normalizeDir(p) {
  return p.endsWith("/") ? p : p + "/";
}

// Auto-discover *.json filenames by fetching the directory. Most static
// servers (npx serve, python3 -m http.server, etc.) return an HTML directory
// listing when there's no index.html — we parse the anchor hrefs out.
//
// As a backup, a custom `${dir}index.json` array of basenames is honored.
async function discoverSheetNames(dir) {
  // Backup: explicit index.json
  try {
    const r = await fetch(`${dir}index.json`);
    if (r.ok) {
      const parsed = await r.json();
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === "string")) {
        return parsed.map((n) => n.replace(/\.json$/i, ""));
      }
    }
  } catch {}

  // Primary: HTML directory listing
  try {
    const r = await fetch(dir);
    if (!r.ok) return [];
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();
    if (ct.includes("html") || /<a\s+href=/i.test(text)) {
      const names = new Set();
      for (const m of text.matchAll(/href=["']([^"']+?\.json)["']/gi)) {
        const file = m[1].split(/[\\/]/).pop();
        if (file && /\.json$/i.test(file) && file !== "index.json") {
          names.add(file.replace(/\.json$/i, ""));
        }
      }
      return Array.from(names);
    }
  } catch {}

  return [];
}

async function loadSheet(jsonUrl, dir) {
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${jsonUrl}`);
  const data = await res.json();
  const imageUrl =
    data.image.startsWith("/") ||
    data.image.startsWith("http") ||
    data.image.startsWith("data:")
      ? data.image
      : `${dir}${data.image}`;
  const image = await loadImage(imageUrl);
  return { data, imageUrl, image };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

export async function loadSheetsFromFolder(files) {
  const byBase = new Map();
  for (const f of files) {
    const m = f.name.match(/^(.+)\.(json|png|jpg|jpeg|webp)$/i);
    if (!m) continue;
    const base = m[1];
    if (!byBase.has(base)) byBase.set(base, {});
    if (m[2].toLowerCase() === "json") byBase.get(base).json = f;
    else byBase.get(base).image = f;
  }
  const sheets = new Map();
  for (const [name, pair] of byBase) {
    if (!pair.json || !pair.image) continue;
    try {
      const data = JSON.parse(await pair.json.text());
      const imageUrl = URL.createObjectURL(pair.image);
      const image = await loadImage(imageUrl);
      sheets.set(name, { data, imageUrl, image });
    } catch (err) {
      console.warn(`[ui-editor] failed to load sheet pair "${name}":`, err);
    }
  }
  return sheets;
}
