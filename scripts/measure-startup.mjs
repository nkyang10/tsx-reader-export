// Dev helper: measure time-to-window for a packaged viewer build.
//
//   node scripts/measure-startup.mjs [path-to-exe]
//
// Spawns the executable and polls for a visible top-level window belonging to
// it, reporting elapsed seconds. Used to compare the unpacked build (~0.2s)
// against the single-file "portable" build (~23s, re-extracts on every run).
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "release", "tsx-reader-export-viewer", "tsx-reader-export-viewer.exe");
const processName = path.basename(target, path.extname(target));

function listWindows() {
  const ps =
    "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | " +
    "ForEach-Object { \"$($_.ProcessName)|$($_.Id)\" }";
  try {
    return execFileSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function killAll() {
  try {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Stop-Process -Name '${processName}' -Force -ErrorAction SilentlyContinue`,
    ]);
  } catch {
    /* ignore */
  }
}

killAll();
await new Promise((r) => setTimeout(r, 1500));

const t0 = Date.now();
const child = spawn(target, [], { detached: true, stdio: "ignore" });
child.unref();

let ok = false;
while (Date.now() - t0 < 120000) {
  if (listWindows().some((l) => l.startsWith(processName + "|"))) {
    ok = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 100));
}
const secs = (Date.now() - t0) / 1000;

killAll();
console.log(
  `${path.basename(target)}: ${secs.toFixed(2)}s  ${ok ? "window shown" : "NO WINDOW"}`
);
process.exit(ok ? 0 : 1);
