# ui-json

A tiny TypeScript runtime and a browser-based authoring editor for
JSON-described UI screens. Author layouts visually, mount them into the
DOM at runtime, wire handlers by `id`. Sprite backgrounds resolve against
the [`easy-spritesheets`](https://github.com/renanliberato/easy-spritesheets)
package.

```
ui-json/
├── library/   # TS runtime: parser, dom-renderer, loader, types
└── editor/    # vanilla-JS browser editor (no build step)
```

## Install

```bash
npm install github:renanliberato/ui-json
```

Then in your code:

```ts
import { loadUIDocument, mountUI, type UIInstance } from "ui-json";
import { loadSpriteSheet } from "easy-spritesheets";

const [doc, sheet] = await Promise.all([
  loadUIDocument("/assets/home.json"),
  loadSpriteSheet("/assets/home-sheet.json"),
]);
const ui: UIInstance = mountUI(doc, document.getElementById("host")!, {
  sheets: { "home-sheet": sheet },
});
ui.getById("play-button")?.addEventListener("click", onPlay);
```

## Run the editor

```bash
npm install
npm run editor             # serves ./editor on localhost
```

When consuming the package from another project, run the editor from
`node_modules`:

```bash
npx serve node_modules/ui-json/editor --symlinks --no-clipboard
```

The editor looks for spritesheets in `./spritesheets/` (relative to the
editor folder) by default — symlink or copy your project's sheets there,
or override the path in `editor/config.json`.

## JSON shape (v1)

```json
{
  "version": 1,
  "design": { "w": 390, "h": 844 },
  "root": {
    "id": "root",
    "type": "div",
    "x": 0, "y": 0, "w": 390, "h": 844,
    "children": [
      {
        "id": "play",
        "type": "button",
        "x": 100, "y": 600, "w": 190, "h": 64,
        "sprite": { "sheet": "home-sheet", "name": "btn-play" }
      }
    ]
  }
}
```

Coordinates are in design pixels. The runtime emits CSS `%` positions
against the offset parent so the document scales to its container.

## License

MIT.
