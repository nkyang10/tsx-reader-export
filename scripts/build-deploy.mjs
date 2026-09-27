// Sync the self-contained Windows deployment folder with the root source.
// Copies src/ and testcases/ into deployment/win and keeps package.json deps
// in sync. node_modules is populated by deployment/win/install.ps1 (npm ci).
//
// deployment/win/src/ and deployment/win/testcases/ are BUILD ARTIFACTS and
// are not committed; regenerate with `npm run build:deploy`.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const win = path.join(root, "deployment", "win");

// styles.generated.mjs is gitignored, so make sure it exists before copying.
execFileSync(process.execPath, [path.join(__dirname, "embed-styles.mjs")], {
  cwd: root,
  stdio: "inherit",
});

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(path.join(root, "src"), path.join(win, "src"));
copyDir(path.join(root, "testcases"), path.join(win, "testcases"));

for (const f of ["out", ".tsx-reader-export-tmp"]) {
  fs.rmSync(path.join(win, f), { recursive: true, force: true });
}

const rootPkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const winPkgPath = path.join(win, "package.json");
const winPkg = JSON.parse(fs.readFileSync(winPkgPath, "utf8"));
winPkg.dependencies = { ...rootPkg.dependencies };
if (rootPkg.overrides) winPkg.overrides = { ...rootPkg.overrides };
winPkg.name = winPkg.name || "tsx-reader-export-win";
delete winPkg.private;
// Write UTF-8 without a BOM: a BOM makes the file invalid JSON for Node.
fs.writeFileSync(winPkgPath, JSON.stringify(winPkg, null, 2) + "\n", "utf8");

console.log("Synced deployment/win (src, testcases, package.json)");
