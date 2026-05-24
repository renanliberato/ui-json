#!/usr/bin/env bun
// Roundtrip test for the UI editor: serves editor/ statically, drives it with
// Playwright via window.editor.*, builds a small doc, serializes, re-imports,
// and asserts the JSON matches.
//
//   bun editor/test-roundtrip.mjs
//
// Requires that `bun install` has run at the repo root (for playwright-core
// and a local Chromium cache).

import { chromium } from "playwright-core";
import path from "node:path";
import { existsSync } from "node:fs";

const EDITOR_ROOT = import.meta.dir;
const PORT = 4373 + Math.floor(Math.random() * 200);

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    if (pathname.endsWith("/")) pathname += "index.html";
    const filePath = path.join(EDITOR_ROOT, pathname);
    if (!filePath.startsWith(EDITOR_ROOT) || !existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(Bun.file(filePath));
  },
});
console.log(`[test] static server on http://localhost:${PORT}`);

const cachedChromium = path.join(
  process.env.HOME ?? "",
  "Library/Caches/ms-playwright/chromium-1223/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
);
const launchOpts = existsSync(cachedChromium)
  ? { executablePath: cachedChromium }
  : {};

const browser = await chromium.launch({ ...launchOpts, headless: true });

let exitCode = 0;
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.editorReady === true, null, {
    timeout: 10000,
  });

  const docIn = {
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
        { id: "title", type: "div", x: 50, y: 100, w: 290, h: 60 },
        {
          id: "play",
          type: "button",
          x: 100,
          y: 500,
          w: 190,
          h: 64,
          sprite: { sheet: "gameplay-actions", name: "any-frame" },
        },
      ],
    },
  };

  const written = await page.evaluate((d) => {
    window.editor.setDoc(d);
    return window.editor.serialize();
  }, docIn);

  const parsed = await page.evaluate((json) => {
    window.editor.loadJSON(json);
    return window.editor.serialize();
  }, written);

  if (parsed !== written) {
    console.error("[FAIL] roundtrip mismatch");
    console.error("--- written ---");
    console.error(written);
    console.error("--- parsed ---");
    console.error(parsed);
    exitCode = 1;
  }

  if (errors.length > 0) {
    console.error("[FAIL] JS errors during run:");
    for (const e of errors) console.error("  " + e);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log("[OK  ] ui-editor roundtrip ok");
  }
} catch (err) {
  console.error("[FAIL] test threw:", err);
  exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  server.stop(true);
}

process.exit(exitCode);
