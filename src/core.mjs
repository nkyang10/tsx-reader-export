import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import styles from "./styles.generated.mjs";

// `import.meta.url` is absent when this file is bundled to CommonJS (the
// single-file .exe build), so fall back to a caller-provided base directory.
const moduleDir =
  typeof import.meta.url === "string"
    ? path.dirname(fileURLToPath(import.meta.url))
    : process.env.TSX_READER_EXPORT_BASE_DIR || process.cwd();

export const SHIM_PACKAGE = "@thisismydesign/cursor-canvas-web";

function resolveShimPath() {
  return path.resolve(moduleDir, "..", "src", "cursor-canvas.compat.mjs");
}

export async function resolveCanvasAlias() {
  const p = resolveShimPath();
  if (!fs.existsSync(p)) {
    throw new Error(
      "cursor/canvas shim not found. Run `npm install` first (needs " +
        SHIM_PACKAGE +
        ")."
    );
  }
  return p;
}

export async function bundleCanvas(
  inputFile,
  { aliasShim = true, shimPath, tmpDir, load, format = "esm" } = {}
) {
  const { build } = await (load || ((s) => import(s)))("esbuild");
  const alias = aliasShim
    ? { "cursor/canvas": shimPath || (await resolveCanvasAlias()) }
    : {};
  const dir = tmpDir || path.join(moduleDir, "..", ".tsx-reader-export-tmp");
  fs.mkdirSync(dir, { recursive: true });
  const outfile = path.join(
    dir,
    `bundle-${Date.now()}-${Math.random().toString(36).slice(2)}.${
      format === "cjs" ? "cjs" : "mjs"
    }`
  );
  await build({
    entryPoints: [inputFile],
    bundle: true,
    platform: "node",
    format,
    jsx: "automatic",
    target: "node18",
    alias,
    // Keep a single React/DOM + UI-library instance shared with the host
    // process to avoid "Invalid hook call" from duplicated React copies.
    external: [
      "react",
      "react-dom",
      "react-dom/*",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "scheduler",
      "@mantine/core",
      "@mantine/charts",
      "@mui/*",
      "recharts",
      "@emotion/*",
    ],
    outfile,
    logLevel: "error",
    loader: { ".tsx": "tsx", ".ts": "ts", ".js": "jsx" },
  });
  return outfile;
}

export function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildHtml({
  title,
  markup,
  styles,
  extraHead = "",
  lang = "en",
}) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${extraHead}
<style>${styles}</style>
</head>
<body>
<div id="root">${markup}</div>
<script>
// tsx-reader-export static export - interactive hydration not required.
// The root div above contains fully-server-rendered markup.
</script>
</body>
</html>`;
}

export async function renderCanvasToHtml(
  inputFile,
  { title, colorScheme, load, shimPath, tmpDir, format = "esm" } = {}
) {
  // `load` lets an alternative host (e.g. the single-file .exe build, which has
  // no ESM loader) resolve react/react-dom/the shim from a sibling node_modules.
  const loadModule = load || ((spec) => import(spec));
  const abs = path.resolve(inputFile);
  if (!fs.existsSync(abs)) throw new Error(`Input file not found: ${abs}`);
  if (!abs.toLowerCase().endsWith(".tsx") && !abs.toLowerCase().endsWith(".ts"))
    throw new Error("Input must be a .tsx or .ts file.");

  const bundleFile = await bundleCanvas(abs, {
    shimPath,
    tmpDir,
    load,
    format,
  });
  try {
    // A CommonJS bundle must be require()d (not import()ed) so that the host
    // and the canvas resolve the same CJS copies of react/mantine/shim.
    const mod =
      format === "cjs"
        ? await loadModule(bundleFile)
        : await import(pathToFileURL(bundleFile).href + `?t=${Date.now()}`);
    const Component = mod.default;
    if (typeof Component !== "function")
      throw new Error("Default export is not a React component.");

    const { createElement } = await loadModule("react");
    const { renderToStaticMarkup } = await loadModule("react-dom/server");
    const { CanvasRoot } = await loadModule(SHIM_PACKAGE + "/runtime");

    const body = createElement(
      CanvasRoot,
      { defaultColorScheme: colorScheme || "light" },
      createElement(Component)
    );
    const markup = renderToStaticMarkup(body);

    const resolvedTitle =
      title || path.basename(abs).replace(/\.(canvas\.)?tsx?$/i, "");

    return buildHtml({
      title: resolvedTitle,
      markup,
      styles,
    });
  } finally {
    try {
      fs.unlinkSync(bundleFile);
    } catch {}
  }
}
