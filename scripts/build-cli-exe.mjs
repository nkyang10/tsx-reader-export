// Build a single-file Windows .exe for the CLI using Node's Single Executable
// Application (SEA) plus postject.
//
//   dist/exe/tsx-reader-export.exe      <- Node runtime + bundled CLI injected
//   dist/exe/node_modules/...  <- react, react-dom, shim, mantine, esbuild
//   dist/exe/cursor-canvas.compat.mjs
//   dist/exe/LICENSE         <- required: MIT notice must ship with the code
//
// The .exe embeds Node, so the machine needs no Node install. It still needs the
// sibling node_modules (SEA can only require() built-ins).
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist", "exe");
const workDir = path.join(root, ".sea-build");

const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// styles.generated.mjs is gitignored and inlined into the bundle below.
execFileSync(process.execPath, [path.join(__dirname, "embed-styles.mjs")], {
  cwd: root,
  stdio: "inherit",
});

fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

// 1. Bundle the CLI to a single CommonJS file (esbuild stays external because
//    its native binary is loaded at runtime from the shipped node_modules).
const bundlePath = path.join(workDir, "cli.cjs");
await build({
  entryPoints: [path.join(root, "src", "cli-exe.mjs")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["esbuild"],
  outfile: bundlePath,
  logLevel: "warning",
});
console.log("bundled CLI ->", path.relative(root, bundlePath));

// 2. Generate the SEA blob.
const seaConfig = {
  main: bundlePath,
  output: path.join(workDir, "sea-prep.blob"),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
};
const seaConfigPath = path.join(workDir, "sea-config.json");
fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, "utf8"));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
  stdio: "inherit",
});
console.log("generated SEA blob");

// 3. Copy the running Node binary and inject the blob with postject.
const exePath = path.join(outDir, "tsx-reader-export.exe");
fs.copyFileSync(process.execPath, exePath);
const postjectCli = path.join(root, "node_modules", "postject", "dist", "cli.js");
if (!fs.existsSync(postjectCli)) {
  throw new Error("postject not installed. Run: npm install --save-dev postject");
}
execFileSync(
  process.execPath,
  [postjectCli, exePath, "NODE_SEA_BLOB", seaConfig.output, "--sentinel-fuse", SENTINEL],
  { stdio: "inherit" }
);
console.log("injected SEA blob ->", path.relative(root, exePath));

// 4. Ship the runtime dependencies next to the exe.
const nm = path.join(outDir, "node_modules");
fs.cpSync(path.join(root, "node_modules"), nm, {
  recursive: true,
  filter: (src) => !src.includes(`${path.sep}.bin${path.sep}`),
});
fs.copyFileSync(
  path.join(root, "src", "cursor-canvas.compat.mjs"),
  path.join(outDir, "cursor-canvas.compat.mjs")
);
// MIT requires our own notice to travel with our code; this folder is the
// shipped artifact, so the LICENSE has to be inside it, not just in the repo.
fs.copyFileSync(path.join(root, "LICENSE"), path.join(outDir, "LICENSE"));
fs.writeFileSync(
  path.join(outDir, "README.txt"),
  [
    "Canvas Reader with HTML and PDF (single-file CLI)",
    "",
    "Usage:",
    "  tsx-reader-export.exe <canvas.tsx> [out.html] [--title \"T\"] [--color-scheme light|dark]",
    "",
    "This folder is self-contained: tsx-reader-export.exe embeds the Node runtime, and",
    "node_modules/ holds react, react-dom, the cursor/canvas shim, Mantine and",
    "esbuild. No separate Node.js installation is required.",
    "",
    "Keep tsx-reader-export.exe and node_modules/ in the same folder.",
    "",
    "TROUBLESHOOTING",
    "  - Double-clicking the .exe shows usage and waits for a keypress.",
    "  - Every run writes a detailed log to  logs\\tsx-reader-export.log",
    "    (or %TEMP%\\tsx-reader-export.log if the exe folder is read-only).",
    "  - Add --verbose to echo progress to the console.",
    "  - Use run-cli.bat if you prefer an explicit console window.",
    "",
    "MIT License (see LICENSE in this folder).",
    "Built on @thisismydesign/cursor-canvas-web (MIT),",
    "whose own LICENSE ships in node_modules/@thisismydesign/cursor-canvas-web.",
  ].join("\r\n"),
  "utf8"
);

// Batch wrapper: guarantees a visible console even if the .exe is double-clicked
// from a shell that closes immediately, and pauses so output stays readable.
fs.writeFileSync(
  path.join(outDir, "run-cli.bat"),
  [
    "@echo off",
    "cd /d \"%~dp0\"",
    "echo [Canvas Reader] starting...",
    "\"%~dp0tsx-reader-export.exe\" %*",
    "set \"RC=%errorlevel%\"",
    "echo.",
    "echo [Canvas Reader] exit code %RC%",
    "if exist \"%~dp0logs\\tsx-reader-export.log\" echo [Canvas Reader] log: %~dp0logs\\tsx-reader-export.log",
    "pause",
    "exit /b %RC%",
  ].join("\r\n"),
  "utf8"
);

fs.rmSync(workDir, { recursive: true, force: true });
const size = (fs.statSync(exePath).size / (1024 * 1024)).toFixed(1);
console.log(`\nDone. ${path.relative(root, exePath)} (${size} MB)`);
