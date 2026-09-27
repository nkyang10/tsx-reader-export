// Sync shared source into the viewer so the Electron app is self-contained
// (and packageable by electron-builder without reaching outside its root).
//
// viewer/src/ is a BUILD ARTIFACT and is not committed; regenerate with
// `npm run build:viewer`.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// styles.generated.mjs is gitignored, so make sure it exists before copying.
execFileSync(process.execPath, [path.join(__dirname, "embed-styles.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const files = [
  "core.mjs",
  "cli.mjs",
  "cli-exe.mjs",
  "cursor-canvas.compat.mjs",
  "styles.generated.mjs",
];
const dest = path.join(root, "viewer", "src");
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(root, "src", f), path.join(dest, f));
}
console.log(`Synced viewer/src (${files.length} files)`);

// electron-builder's appDir is viewer/, and it refuses to reach outside that
// root, so the root LICENSE cannot be picked up by a `files:` glob. The
// packaged app ships our src/ and therefore has to ship the MIT notice too, so
// stage a copy where the packager can see it. Regenerated, never committed.
fs.copyFileSync(
  path.join(root, "LICENSE"),
  path.join(root, "viewer", "LICENSE")
);
console.log("Staged viewer/LICENSE");
