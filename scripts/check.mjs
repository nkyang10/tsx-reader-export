// Build / validate: regenerate embedded styles and render every fixture.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist", "out");

// Guard: the three manifests must agree on the version. They have drifted
// before (0.1.0 / 0.1.0 / 1.0.0), which silently mislabels release artifacts.
const manifests = [
  "package.json",
  path.join("viewer", "package.json"),
  path.join("deployment", "win", "package.json"),
];
const versions = manifests.map((rel) => [
  rel,
  JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")).version,
]);
const distinct = [...new Set(versions.map(([, v]) => v))];
if (distinct.length > 1) {
  console.error(
    `FAIL version mismatch: ${versions
      .map(([f, v]) => `${f}=${v}`)
      .join(", ")}`
  );
  process.exitCode = 1;
} else {
  console.log(`ok   version ${distinct[0]} consistent across manifests`);
}

execFileSync(process.execPath, [path.join(__dirname, "embed-styles.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const casesDir = path.join(root, "testcases");
const cases = fs
  .readdirSync(casesDir)
  .filter((f) => /\.(canvas\.)?tsx$/.test(f));

fs.mkdirSync(outDir, { recursive: true });

let ok = true;
for (const c of cases) {
  const base = c.replace(/\.(canvas\.)?tsx$/i, "");
  const out = path.join(outDir, base + ".html");
  try {
    execFileSync(
      process.execPath,
      ["src/cli.mjs", path.join("testcases", c), out],
      { cwd: root, stdio: "pipe" }
    );
    const size = fs.statSync(out).size;
    if (size < 500) throw new Error("suspiciously small output");
    console.log(`ok   ${c} -> ${size} bytes`);
  } catch (e) {
    ok = false;
    console.error(`FAIL ${c}: ${e.message}`);
  }
}

process.exitCode = ok ? 0 : 1;
