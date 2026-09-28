// Assemble both Windows executables into one release folder:
//
//   release/
//     tsx-reader-export-viewer.exe     <- the reader, at the top level
//     locales\ resources\ *.pak *.dll  <- its Electron runtime, must sit beside it
//     cli\                             <- the command line converter
//       tsx-reader-export.exe
//       node_modules\  cursor-canvas.compat.mjs  run-cli.bat
//     LICENSE  README.txt
//
// The reader is the product, so it is the thing you double-click: its exe is at
// the top level. An unpacked Electron app cannot be a single file though - it
// needs locales\, resources\ and the *.pak/*.dll siblings in the same directory -
// so those live at the top level too. The CLI is the secondary entry point and
// takes the one subfolder, release\cli\. Nothing in the CLI resolves paths
// outside its own folder (src/cli-exe.mjs derives everything from
// process.execPath), so it is self-contained there.
//
// Both targets run without installing anything. The viewer is shipped
// UNPACKED rather than as a single "portable" exe on purpose: the portable
// target re-extracts ~200 MB on every launch (measured 23s to window) whereas
// the unpacked folder starts in ~0.3s.
//
// release\cli\ is built IN PLACE by scripts/build-cli-exe.mjs. There used to be
// a dist\exe\ staging copy that this script then moved across - a second 130 MB
// tree on disk and a full copy of ~13,000 files per release build. The only
// thing copied now is the viewer's unpacked build.
//
// Pass --no-build to re-assemble the viewer side from existing build output,
// keeping the release\cli\ that is already there.
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
  // The CLI is built straight into release\cli\ - there is no staging copy.
  // scripts/build-cli-exe.mjs wipes and rebuilds that folder itself.
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

// Clear the release root but KEEP release\cli\. The CLI is built in place, so a
// full `rm -rf release` would throw away the executable it just built; a
// --no-build re-assemble has to keep the one it already has.
fs.mkdirSync(release, { recursive: true });
for (const entry of fs.readdirSync(release)) {
  if (entry === "cli") continue;
  fs.rmSync(path.join(release, entry), { recursive: true, force: true });
}
if (!fs.existsSync(path.join(release, "cli", "tsx-reader-export.exe"))) {
  throw new Error(
    "release\\cli\\tsx-reader-export.exe missing. Run without --no-build."
  );
}

// --- Reader: flatten the unpacked build into release/ (fast, no install) ---
// The exe must sit beside locales\ and resources\, so its contents go to the
// top level rather than into a subfolder of its own.
const unpacked = path.join(root, "viewer", "dist", "win-unpacked");
if (!fs.existsSync(unpacked)) {
  throw new Error("Viewer build missing. Run without --no-build.");
}
for (const entry of fs.readdirSync(unpacked, { withFileTypes: true })) {
  fs.cpSync(path.join(unpacked, entry.name), path.join(release, entry.name), {
    recursive: true,
  });
}
// Windows marks extracted .exe files as "blocked" (Zone.Identifier) after being
// copied from a build output; clear it so the app starts without a prompt. It
// runs over the whole release tree now, which includes release\cli\ - harmless,
// since those files are built locally and carry no Zone.Identifier to begin
// with, and Unblock-File is a metadata-only change.
try {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-ChildItem -LiteralPath '${release}' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue`,
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
    "1) tsx-reader-export-viewer.exe  - Canvas Reader, the app",
    "     Double-click it. It is right here, at the top level.",
    "     Open a Cursor canvas .tsx, preview it, Save as HTML, or Print/PDF",
    "     via the Windows print dialog.",
    "     It starts immediately (~0.2s). Keep this whole folder together: the",
    "     locales\\, resources\\ and *.pak / *.dll files beside the exe are its",
    "     runtime, not clutter.",
    "     Log: %APPDATA%\\tsx-reader-export-viewer\\viewer.log",
    "",
    "2) cli\\                          - the command line converter",
    "       cli\\tsx-reader-export.exe my.canvas.tsx out.html",
    "       cli\\tsx-reader-export.exe my.canvas.tsx out.html --title \"My Page\"",
    "       cli\\tsx-reader-export.exe my.canvas.tsx out.html --color-scheme dark",
    "     cli\\run-cli.bat takes the same arguments if you want a console window",
    "     that stays open. Prefer the app above unless you are scripting.",
    "     KEEP the whole cli\\ folder together - the executable embeds Node but",
    "     loads React and the cursor/canvas shim from its node_modules\\.",
    "     Log: cli\\logs\\tsx-reader-export.log  (add --verbose for console output)",
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

// MIT requires our own notice to travel with our code. The app carries a copy
// inside resources\app\, but the top level of the zip should show it too - that
// is where the reader's exe lives, and the Electron runtime around it carries
// only Chromium's own notices.
fs.copyFileSync(path.join(root, "LICENSE"), path.join(release, "LICENSE"));

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
