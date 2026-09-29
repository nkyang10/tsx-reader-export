import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderCanvasToHtml } from "./src/core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;

// Detailed log file so a silent/failed launch is diagnosable. Packaged (portable)
// builds show no console, so this is the only diagnostic channel.
const LOG_FILE = path.join(
  process.env.TSX_READER_EXPORT_LOG_DIR || app.getPath("userData"),
  "viewer.log"
);
function log(...args) {
  const line =
    "[viewer] " +
    args
      .map((a) => (typeof a === "string" ? a : safe(a)))
      .join(" ") +
    "\n";
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* never break the app on logging failure */
  }
  console.log(line.trimEnd());
}
function safe(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

process.on("uncaughtException", (e) => {
  log("UNCAUGHT", e && e.stack ? e.stack : String(e));
});
process.on("unhandledRejection", (e) => {
  log("UNHANDLED REJECTION", e && e.stack ? e.stack : String(e));
});

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    title: "Canvas Reader",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  log("window created", JSON.stringify(win.getBounds()));
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    log("did-fail-load", code, desc, url)
  );
  win.webContents.on("render-process-gone", (_e, details) =>
    log("render-process-gone", JSON.stringify(details))
  );
  win.loadFile(path.join(__dirname, "renderer", "index.html"))
    .then(() => log("renderer loaded"))
    .catch((e) => log("loadFile failed", e && e.stack ? e.stack : String(e)));
}

function titleFrom(filePath) {
  const base = path.basename(filePath).replace(/\.(canvas\.)?tsx?$/i, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// The canvas bundle must be written to a real directory that can still resolve
// the app's node_modules (so the bundle shares this process's react). It also
// has to be readable by the esbuild child process, which cannot see app.asar.
const RENDER_OPTS = {
  shimPath: path.join(__dirname, "src", "cursor-canvas.compat.mjs"),
  tmpDir: path.join(__dirname, ".tsx-reader-export-tmp"),
};

// Headless self-check: `viewer.exe --smoke <canvas.tsx>` renders a canvas and
// exits, so the packaged build can be verified without GUI interaction.
async function runSmoke(canvasPath) {
  const target = canvasPath
    ? path.resolve(canvasPath)
    : path.resolve(__dirname, "..", "testcases", "example.canvas.tsx");
  log("SMOKE start", target);
  log("SMOKE shimPath", RENDER_OPTS.shimPath, fs.existsSync(RENDER_OPTS.shimPath));
  const html = await renderCanvasToHtml(target, {
    title: titleFrom(target),
    ...RENDER_OPTS,
  });
  const out = path.join(RENDER_OPTS.tmpDir, "smoke.html");
  fs.mkdirSync(RENDER_OPTS.tmpDir, { recursive: true });
  fs.writeFileSync(out, html, "utf8");
  log("SMOKE OK", `${html.length} chars ->`, out);
  console.log(`SMOKE OK ${html.length} chars -> ${out}`);
  app.exit(0);
}

app.whenReady().then(() => {
  log("app ready", `electron ${process.versions.electron}`, `node ${process.version}`);
  log("log file:", LOG_FILE);
  log("resources path:", process.resourcesPath || "(dev)");
  log("argv:", safe(process.argv.slice(1)));
  log("app dir:", __dirname);
  log("shim exists:", fs.existsSync(RENDER_OPTS.shimPath));
  log(
    "node_modules present:",
    fs.existsSync(path.join(__dirname, "node_modules", "react"))
  );

  if (process.argv.includes("--smoke")) {
    const i = process.argv.indexOf("--smoke");
    runSmoke(process.argv[i + 1]).catch((e) => {
      log("SMOKE FAILED", e && e.stack ? e.stack : String(e));
      console.error("SMOKE FAILED", e && e.message ? e.message : e);
      app.exit(1);
    });
    return;
  }

  createWindow();

  // Render a .tsx canvas into a self-contained HTML string (reuses CLI core).
  // `opts.colorScheme` picks the canvas theme; the shim bakes its token palette
  // into the markup at render time, so switching it means re-rendering.
  ipcMain.handle("viewer:renderPath", async (_e, filePath, opts) => {
    if (typeof filePath !== "string" || !filePath)
      throw new Error("No file path given.");
    const t0 = Date.now();
    log("renderPath", filePath, safe(opts));
    try {
      const html = await renderCanvasToHtml(filePath, {
        title: titleFrom(filePath),
        colorScheme: opts && opts.colorScheme,
        ...RENDER_OPTS,
      });
      log("renderPath ok", filePath, `${html.length} chars`, `${Date.now() - t0}ms`);
      return html;
    } catch (e) {
      log("renderPath FAILED", filePath, e && e.stack ? e.stack : String(e));
      throw e;
    }
  });

  ipcMain.handle("viewer:open", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Open canvas",
      filters: [
        { name: "Canvas", extensions: ["tsx", "ts"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (canceled || filePaths.length === 0) return { opened: false };
    return { opened: true, path: path.resolve(filePaths[0]) };
  });

  ipcMain.handle("viewer:save", async (_e, payload) => {
    const html = payload && payload.html;
    if (!html) return { saved: false, error: "Nothing to save." };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save as HTML",
      defaultPath: "canvas.html",
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, html, "utf8");
    log("saved", filePath, `${html.length} chars`);
    return { saved: true, path: filePath };
  });

  // Print the preview. Electron's print() opens the system print dialog on
  // Windows/macOS/Linux (Windows includes "Microsoft Print to PDF" / Save as PDF).
  ipcMain.handle("viewer:print", async (_e, payload) => {
    const html = payload && payload.html;
    if (!html) return { printed: false, error: "Nothing to print." };
    log("print requested", `${html.length} chars`);
    const printer = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: true },
    });
    try {
      await printer.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html)
      );
      await new Promise((resolve) => printer.webContents.print(
        { silent: false, printBackground: true, preferCSSPageSize: true },
        (success, reason) => {
          log("print callback", `success=${success}`, `reason=${reason}`);
          if (!success && reason && reason !== "cancelled")
            log("PRINT FAILED", reason);
        }
      ));
      return { printed: true };
    } catch (err) {
      log("print threw", err && err.stack ? err.stack : String(err));
      return { printed: false, error: String((err && err.message) || err) };
    } finally {
      printer.destroy();
    }
  });

  // Drag-and-drop: Electron 32+ removed File.path and webUtils is not present
  // in every supported build, so the renderer sends the file *contents* and we
  // render from a temp file instead of relying on a real filesystem path.
  ipcMain.handle("viewer:renderSource", async (_e, name, text, opts) => {
    if (typeof text !== "string" || !text)
      throw new Error("Dropped file had no readable contents.");
    const safeName = String(name || "canvas.tsx").replace(/[^\w.\-]/g, "_");
    const tmp = path.join(
      RENDER_OPTS.tmpDir,
      `drop-${Date.now()}-${safeName}`
    );
    fs.mkdirSync(RENDER_OPTS.tmpDir, { recursive: true });
    log("renderSource (dropped)", safeName, `${text.length} chars`, safe(opts));
    await fs.promises.writeFile(tmp, text, "utf8");
    try {
      return await renderCanvasToHtml(tmp, {
        title: titleFrom(safeName),
        colorScheme: opts && opts.colorScheme,
        ...RENDER_OPTS,
      });
    } catch (e) {
      log("renderSource FAILED", e && e.stack ? e.stack : String(e));
      throw e;
    } finally {
      fs.promises.unlink(tmp).catch(() => {});
    }
  });

  ipcMain.handle("viewer:openExternal", (_e, url) => shell.openExternal(url));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
