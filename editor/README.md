# UI Editor

Browser-based WYSIWYG editor for the `ui-json` runtime. Author screen
layouts as JSON; the runtime mounts them into the DOM at runtime and
`getById` exposes them to game code for handler wiring.

## Run it

```bash
# From the ui-json repo root:
npx serve editor --symlinks --no-clipboard
# then open the URL it prints (e.g. http://localhost:3000)

# From a consuming project (after `npm install github:renanliberato/ui-json`):
npx serve node_modules/ui-json/editor --symlinks --no-clipboard
```

The editor needs to find your spritesheets. The default location is
`./spritesheets/` (relative to the editor folder). Simplest setup is a
symlink:

```bash
# From a consuming project, point the editor at your real sheets:
ln -s "$(pwd)/src/assets/spritesheets" node_modules/ui-json/editor/spritesheets
```

The editor reads a manifest `spritesheets/index.json` produced by:

```bash
node node_modules/ui-json/editor/sync-sheets-index.mjs <dir>
```

…or, if no manifest exists, it falls back to parsing the directory
listing returned by static servers like `npx serve` or
`python3 -m http.server`.

## Override the sheets path

Edit `editor/config.json`:

```json
{ "spritesheetsDir": "/some/other/path/" }
```

or a list of candidates tried in order:

```json
{ "spritesheetsDirs": ["./spritesheets/", "/assets/sheets/"] }
```

The **Reload sheets** button re-fetches without a page reload. **Load
other folder…** uses `webkitdirectory` to pull in additional sheets
ad-hoc (no manifest required for that path — it scans the FileList
directly).

## Layout

- **Toolbar** (top) — New / Open JSON / Save JSON / Reload sheets /
  Load other folder / Snap-to-pixel.
- **Hierarchy** (left) — tree of nodes. Click selects, double-click
  renames, `+` adds an empty `div`, drag reorders / reparents.
- **Stage** (center) — design-sized frame showing the live document.
  Click an element to select; drag the body to move; drag the
  corner/edge handles to resize. Modifiers:
  - `Shift` while resizing → preserve aspect ratio.
  - `Ctrl/Cmd` while resizing → symmetric resize around center.
  - Arrow keys → nudge 1px (`Shift+arrows` = 10px).
  - `Delete` → remove selected.
  - `Esc` → deselect.
- **Sprites** (right) — library of frames from every sheet loaded.
  Drag a thumbnail onto the stage to add it as a new element sized to
  the sprite's natural dimensions.
- **Properties** (bottom) — edit id, type (`div`/`button`), x/y/w/h,
  sprite ref of the selected element.

## JSON Schema (v1)

```json
{
  "version": 1,
  "design": { "w": 390, "h": 844 },
  "root": {
    "id": "root", "type": "div",
    "x": 0, "y": 0, "w": 390, "h": 844,
    "children": [
      { "id": "play-btn", "type": "button",
        "sprite": { "sheet": "home-sheet", "name": "btn-primary" },
        "x": 100, "y": 600, "w": 190, "h": 64 }
    ]
  },
  "meta": { "createdBy": "ui-editor", "createdAt": "…" }
}
```

`design.{w,h}` is the authoring resolution. The runtime emits CSS `%`
positions against the offset parent so the document scales to fit
whatever container you mount it into.

## Tests

```bash
bun editor/test-roundtrip.mjs
```

Boots a static server, drives the editor with Playwright, builds a doc,
serializes, re-parses, and asserts the JSON matches.
