// Headless-ish smoke test: run under Electron, render the fixture to HTML,
// write it to disk, capture a screenshot of the preview, then exit.
// Usage: npx electron smoke.mjs [canvasPath]
import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderCanvasToHtml } from "./src/core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const canvas = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "..", "testcases", "example.canvas.tsx");
const outDir = path.resolve(__dirname, "..", "out", "smoke");
fs.mkdirSync(outDir, { recursive: true });

app.whenReady().then(async () => {
  try {
    const html = await renderCanvasToHtml(canvas, {});
    const htmlPath = path.join(outDir, "preview.html");
    fs.writeFileSync(htmlPath, html, "utf8");

    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: false,
      webPreferences: { offscreen: true },
    });
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html)
    );
    await new Promise((r) => setTimeout(r, 1500));
    const img = await win.webContents.capturePage();
    const pngPath = path.join(outDir, "preview.png");
    fs.writeFileSync(pngPath, img.toPNG());

    const title = await win.webContents.executeJavaScript("document.title");
    const hasRoot = await win.webContents.executeJavaScript(
      "!!document.querySelector('#root') && document.querySelector('#root').children.length"
    );

    console.log("SMOKE OK");
    console.log("  canvas :", canvas);
    console.log("  html   :", htmlPath, `(${Buffer.byteLength(html, "utf8")} bytes)`);
    console.log("  png    :", pngPath, `(${fs.statSync(pngPath).size} bytes)`);
    console.log("  title  :", title);
    console.log("  #root children:", hasRoot);
    win.destroy();
    app.exit(0);
  } catch (e) {
    console.error("SMOKE FAIL:", e && e.stack ? e.stack : e);
    app.exit(1);
  }
});
