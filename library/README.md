# @ui-json/library

The runtime half of [ui-json](https://github.com/renanliberato/ui-json).
Authored layouts are JSON; `mountUI` builds the DOM tree from them.

## Install

```bash
npm install github:renanliberato/ui-json
```

The package ships TypeScript source via the `exports` field — Vite and
Bun both resolve it directly, no build step on the consumer side.

## Usage

```ts
import { parseUIDocument, mountUI, loadUIDocument } from "ui-json";
import { loadSpriteSheet } from "easy-spritesheets";

// Either parse a value you already have…
const doc = parseUIDocument(rawJson);

// …or fetch + parse in one step.
const fetched = await loadUIDocument("/assets/home.json");

// `sheets` is a Record<sheet-name, SpriteSheet>. The keys must match
// the `sprite.sheet` values inside the UI document.
const sheet = await loadSpriteSheet("/assets/home-sheet.json");
const ui = mountUI(doc, document.getElementById("host")!, {
  sheets: { "home-sheet": sheet },
});

ui.getById("play-button")?.addEventListener("click", onPlay);
ui.unmount(); // tears down later
```

## Tests

```bash
bun test library/src
```
