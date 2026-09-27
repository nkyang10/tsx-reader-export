// Assemble both Windows executables into one release folder:
//
//   release/
//     tsx-reader-export-viewer/       <- unpacked Electron app: no install, instant start
//       tsx-reader-export-viewer.exe
//     tsx-reader-export.exe            <- CLI (Node SEA) + node_modules\ + shim
//     run-cli.bat
//     README.txt
//
// Both targets run without installing anything. The viewer is shipped
// UNPACKED rather than as a single "portable" exe on purpose: the portable
// target re-extracts ~200 MB on every launch (measured 23s to window) whereas
// the unpacked folder starts in ~0.3s.
//
// Pass --no-build to re-assemble from existing build output.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const release = path.join(root, "release");
const noBuild = process.argv.includes("--no-build");

function run(cmd, args, cwd) {
  // No shell and no manual quoting: execFileSync passes argv straight to the OS,
  // so a path like "C:\Program Files\nodejs\node.exe" works as a single argument.
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

if (!noBuild) {
  console.log("==> Building CLI executable (Node SEA)...");
  run(process.execPath, [path.join(root, "scripts", "build-cli-exe.mjs")], root);

  console.log("==> Building viewer (unpacked Electron app)...");
  // Sync viewer/src and stage viewer/LICENSE first: electron-builder's appDir is
  // viewer/ and cannot reach the repo root for either.
  run(process.execPath, [path.join(root, "scripts", "build-viewer.mjs")], root);
  const viewer = path.join(root, "viewer");
  // Invoke electron-builder's JS entry directly: the .cmd shim cannot be
  // spawned without a shell (EINVAL) on Windows.
  const ebCli = path.join(
    viewer,
    "node_modules",
    "electron-builder",
    "out",
    "cli",
    "cli.js"
  );
  const eb = fs.existsSync(ebCli)
    ? { cmd: process.execPath, args: [ebCli] }
    : {
        cmd: path.join(
          viewer,
          "node_modules",
          ".bin",
          process.platform === "win32" ? "electron-builder.cmd" : "electron-builder"
        ),
        args: [],
      };
  run(eb.cmd, [...eb.args, "--win", "dir", "--x64"], viewer);
}

fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(release, { recursive: true });

// --- CLI: copy the whole dist/exe folder (exe + node_modules + shim + bat) ---
const cliSrc = path.join(root, "dist", "exe");
if (!fs.existsSync(path.join(cliSrc, "tsx-reader-export.exe"))) {
  throw new Error("CLI exe missing. Run without --no-build.");
}
fs.cpSync(cliSrc, release, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(cliSrc, src);
    // Skip build leftovers; keep node_modules, exe, bat, shim, README.
    return !rel.startsWith("logs") && !rel.startsWith("out") && !rel.startsWith(".tmp");
  },
});

// --- Viewer: copy the unpacked build as a folder (fast, no install) ---
const unpacked = path.join(root, "viewer", "dist", "win-unpacked");
if (!fs.existsSync(unpacked)) {
  throw new Error("Viewer build missing. Run without --no-build.");
}
const viewerDir = path.join(release, "tsx-reader-export-viewer");
fs.cpSync(unpacked, viewerDir, { recursive: true });
// Windows marks extracted .exe files as "blocked" (Zone.Identifier) after being
// copied from a build output; clear it so the app starts without a prompt.
try {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-ChildItem -LiteralPath '${viewerDir}' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue`,
    ],
    { stdio: "ignore" }
  );
} catch {
  /* not fatal */
}

const rootPkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const VERSION = rootPkg.version;
const ZIP_NAME = `tsx-reader-export-${VERSION}-windows-x64.zip`;

fs.writeFileSync(
  path.join(release, "README.txt"),
  [
    `Canvas Reader with HTML and PDF ${VERSION} - Windows release`,
    "",
    "Two programs. NEITHER requires an installer, and neither needs Node.js.",
    "",
    "1) tsx-reader-export-viewer\\  - Canvas Reader, the GUI",
    "     Double-click  tsx-reader-export-viewer\\tsx-reader-export-viewer.exe",
    "     Open a Cursor canvas .tsx, preview it, Save as HTML, or Print/PDF",
    "     via the Windows print dialog.",
    "     This is an unpacked app folder, so it starts immediately (~0.2s).",
    "     Keep the whole folder together.",
    "     Log: %APPDATA%\\tsx-reader-export-viewer\\viewer.log",
    "",
    "2) tsx-reader-export.exe      - the command line converter",
    "       tsx-reader-export.exe my.canvas.tsx out.html",
    "       tsx-reader-export.exe my.canvas.tsx out.html --title \"My Page\"",
    "       tsx-reader-export.exe my.canvas.tsx out.html --color-scheme dark",
    "     KEEP tsx-reader-export.exe and the node_modules\\ folder together - the",
    "     executable embeds Node but loads React and the cursor/canvas shim",
    "     from that folder.",
    "     Log: logs\\tsx-reader-export.log   (add --verbose for console output)",
    "",
    "The HTML output is fully self-contained: all CSS is inlined and there are",
    "no external stylesheet links, so the file works offline.",
    "",
    "Both are UNSIGNED, so Windows SmartScreen shows a warning on first run.",
    "Choose \"More info\" -> \"Run anyway\".",
    "",
    "MIT License. Built on @thisismydesign/cursor-canvas-web (MIT).",
  ].join("\r\n"),
  "utf8"
);

function fileSize(p) {
  return (fs.statSync(p).size / (1024 * 1024)).toFixed(1);
}

function dirSize(p) {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    total += e.isDirectory() ? dirSize(f) : fs.statSync(f).size;
  }
  return total;
}

console.log(`\nRelease folder: ${path.relative(root, release)}`);
for (const f of fs.readdirSync(release).sort()) {
  const p = path.join(release, f);
  const size = fs.statSync(p).isDirectory()
    ? (dirSize(p) / (1024 * 1024)).toFixed(1)
    : fileSize(p);
  console.log(`  ${fs.statSync(p).isDirectory() ? f + "\\" : f}  (${size} MB)`);
}

// --- Zip it for distribution, with a single top-level versioned folder ---
if (process.argv.includes("--zip")) {
  const staging = path.join(root, ".release-zip");
  fs.rmSync(staging, { recursive: true, force: true });
  const topDir = path.join(staging, `tsx-reader-export-${VERSION}-windows-x64`);
  fs.mkdirSync(topDir, { recursive: true });
  for (const f of fs.readdirSync(release)) {
    fs.cpSync(path.join(release, f), path.join(topDir, f), { recursive: true });
  }
  const zipPath = path.join(root, ZIP_NAME);
  fs.rmSync(zipPath, { force: true });
  console.log(`\nZipping -> ${ZIP_NAME} (this may take a few minutes)...`);
  // tar ships with Windows 10+ and writes a normal zip; far faster than
  // Compress-Archive for ~470 MB.
  execFileSync(
    "tar",
    ["-a", "-c", "-f", zipPath, "-C", staging, path.basename(topDir)],
    { stdio: "inherit" }
  );
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`Created ${ZIP_NAME} (${fileSize(zipPath)} MB)`);
}
