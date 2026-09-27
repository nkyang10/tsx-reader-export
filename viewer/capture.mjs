// Generate the README screenshots. Run with:
//   npm run capture                 -> the four committed PNGs
//   npm run capture -- --pdf        -> also dist/sample-output.pdf
//
// Produces, in docs/images/:
//   viewer-empty.png   the reader on its own, nothing loaded (drop zone)
//   viewer.png         the reader with the canvas rendered in the preview pane
//   viewer-error.png   the reader's failure state (red status bar)
//   output.png         the exported HTML by itself, as a browser would show it
//
// and, with --pdf, dist/sample-output.pdf: the same HTML printed without the
// OS dialog. That one is a release artifact rather than documentation, so it
// lands in the gitignored dist/ and is attached to the GitHub release.
//
// Native window chrome (the title bar reading "Canvas Reader") is in none of
// them: capturePage() grabs only the web contents of a hidden window. Getting
// the real frame needs a visible window plus a screen capture, which depends
// on the session, DPI and what is on screen - so the shots stay deterministic
// and identical on every machine. See AGENTS.md rule 12.
//
// docs/images/ is COMMITTED, so it may only ever hold a capture of the
// repository's own synthetic fixture. Passing a real canvas writes to a
// throwaway directory instead, via CAPTURE_OUT or --out <dir>; a real canvas
// can contain anything, and a screenshot of it is that data as pixels.
//
// A single BrowserWindow is reused for both shots: creating a second window
// after destroying the first races and makes loadFile fail with ERR_FAILED.
import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderCanvasToHtml } from "./src/core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FIXTURE = path.join(root, "testcases", "example.canvas.tsx");
const COMMITTED = path.join(root, "docs", "images");
const canvas = process.argv[2] || FIXTURE;
const tmpDir = path.join(__dirname, ".capture-tmp");

// Send the capture somewhere throwaway. Without this, only the synthetic
// fixture is allowed to write into the committed directory.
//
// Two routes, because `npm run capture -- --out <dir>` does not survive npm:
// it drops the flag and passes <dir> as the canvas. The env var is the
// reliable one; --out works when electron is invoked directly.
const outIdx = process.argv.indexOf("--out");
const outDir =
  outIdx >= 0
    ? process.argv[outIdx + 1]
    : process.env.CAPTURE_OUT || null;
const assets = outDir ? path.resolve(outDir) : COMMITTED;
const isFixture = path.resolve(canvas) === FIXTURE;
// `npm run capture -- --pdf` does not survive npm either, so the env var is
// the reliable route (same reason as CAPTURE_OUT).
const wantPdf =
  process.argv.includes("--pdf") || process.env.CAPTURE_PDF === "1";

if (!outDir && !isFixture) {
  console.error(
    "refusing to write a capture of " +
      path.basename(canvas) +
      " into " +
      path.relative(root, COMMITTED) +
      ", which is committed to the repository.\n" +
      "That canvas may contain private data, and a screenshot of it would\n" +
      "publish that data as pixels. See AGENTS.md rule 12.\n" +
      "\n" +
      "For a throwaway capture of your own canvas, either:\n" +
      "  $env:CAPTURE_OUT = \"$env:TEMP\\shots\"\n" +
      "  npm run capture -- <your.canvas.tsx>\n" +
      "or invoke electron directly:\n" +
      "  viewer\\node_modules\\electron\\dist\\electron.exe viewer\\capture.mjs" +
      " <your.canvas.tsx> --out <dir>"
  );
  app.exit(1);
}

const WIDTH = 1440;
const HEIGHT = 900;

async function settle(win) {
  await new Promise((r) => setTimeout(r, 700));
  await win.webContents.executeJavaScript(
    "new Promise(r => setTimeout(r, 500))"
  );
  await new Promise((r) => setTimeout(r, 500));
}

app.whenReady().then(async () => {
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    const html = await renderCanvasToHtml(canvas, {
      shimPath: path.join(__dirname, "src", "cursor-canvas.compat.mjs"),
      tmpDir,
    });
    const name = path.basename(canvas);
    const shots = [];

    const shoot = async (file) => {
      await settle(win);
      const p = path.join(assets, file);
      fs.writeFileSync(p, (await win.webContents.capturePage()).toPNG());
      shots.push(p);
    };

    // --- 1. the reader on its own, before anything is loaded ---
    // This is what a first-time visitor sees: the toolbar, the disabled
    // Save/Print buttons and the drop zone.
    await win.loadFile(path.join(__dirname, "renderer", "index.html"));
    await shoot("viewer-empty.png");

    // --- 2. the same window with the canvas rendered in the preview pane ---
    await win.webContents.executeJavaScript(`(() => {
      const frame = document.getElementById('preview');
      frame.srcdoc = ${JSON.stringify(html)};
      frame.classList.add('visible');
      document.getElementById('drop').style.display = 'none';
      document.getElementById('file').textContent = ${JSON.stringify(name)};
      document.getElementById('btn-save').disabled = false;
      document.getElementById('btn-print').disabled = false;
      document.getElementById('status').textContent = 'Loaded ' + ${JSON.stringify(name)};
      return true;
    })()`);
    await shoot("viewer.png");

    // --- 3. the failure state ---
    // Posed, not provoked: the status bar is driven directly. A genuinely
    // broken canvas cannot be used here, because `npm run check` renders every
    // file in testcases/ and would fail on it. The wording is a real error
    // this tool produces (see src/core.mjs).
    await win.webContents.executeJavaScript(`(() => {
      const frame = document.getElementById('preview');
      frame.classList.remove('visible');
      frame.srcdoc = '';
      document.getElementById('drop').style.display = '';
      document.getElementById('file').textContent = 'broken.canvas.tsx';
      document.getElementById('btn-save').disabled = true;
      document.getElementById('btn-print').disabled = true;
      const s = document.getElementById('status');
      s.textContent = 'Failed: Default export is not a React component.';
      s.classList.add('error');
      return true;
    })()`);
    await shoot("viewer-error.png");

    // --- 4. the exported HTML on its own, as a browser would show it ---
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html)
    );
    await shoot("output.png");

    // --- optional: the same HTML as a real PDF, no print dialog involved ---
    // The Print button deliberately hands off to the OS dialog; this is the
    // headless equivalent. It is a release artifact, not documentation, so it
    // goes to dist/ (gitignored) rather than into the committed docs/images/.
    if (wantPdf) {
      const pdfDir = outDir
        ? assets
        : path.join(root, "dist");
      fs.mkdirSync(pdfDir, { recursive: true });
      const pdfWin = new BrowserWindow({ show: false });
      try {
        await pdfWin.loadURL(
          "data:text/html;charset=utf-8," + encodeURIComponent(html)
        );
        const data = await pdfWin.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
        });
        const p = path.join(pdfDir, "sample-output.pdf");
        fs.writeFileSync(p, data);
        shots.push(p);
      } finally {
        pdfWin.destroy();
      }
    }

    for (const p of shots) {
      const kb = (fs.statSync(p).size / 1024).toFixed(0);
      console.log(`wrote ${path.relative(root, p)} (${kb} KB)`);
    }
    app.exit(0);
  } catch (e) {
    console.error("capture failed:", e && e.stack ? e.stack : e);
    app.exit(1);
  }
});
