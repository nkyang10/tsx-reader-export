# Architecture

How Canvas Reader is put together, and why it is shaped this way. For *what
changed and when*, see [`engineering-log.md`](./engineering-log.md). For the
rules that constrain changes, see [`../AGENTS.md`](../AGENTS.md).

## The pipeline

A Cursor canvas is a `.tsx` that imports only from `cursor/canvas` — a **virtual
module** supplied by the Cursor IDE at compile time. It does not exist on npm, so
a canvas cannot be built or rendered outside the IDE.

```
canvas.tsx
  │  imports "cursor/canvas"          (virtual, IDE-only)
  ▼
esbuild bundle                         src/core.mjs#bundleCanvas
  │  alias "cursor/canvas" -> src/cursor-canvas.compat.mjs
  │  external: react, react-dom, @mantine/*, recharts   (rule #3)
  ▼
dynamic import() of the bundle         -> default export = React component
  │
  ▼
renderToStaticMarkup(<CanvasRoot>)     @thisismydesign/cursor-canvas-web/runtime
  │
  ▼
one self-contained .html               src/core.mjs#buildHtml
     (Mantine CSS inlined from styles.generated.mjs, no CDN <link>)
```

Three properties are load-bearing:

- **One React.** The canvas bundle marks `react`/`react-dom` and the UI libs as
  `external` so it shares the host process's copies. Two React copies means
  "Invalid hook call"; this is `AGENTS.md` rule #3.
- **One token surface.** `src/cursor-canvas.compat.mjs` re-exports the public
  shim but wraps `useHostTheme()` to add `theme.category` (mapped to the shim's
  `colorPalette`). The real Cursor SDK exposes `category`; the public shim does
  not, and canvases in the wild read `theme.category.yellow`.
- **Fully offline output.** `scripts/embed-styles.mjs` inlines Mantine's CSS
  into `src/styles.generated.mjs`, so the produced HTML has zero external
  stylesheet links.

## The four entry points

One rendering core, four ways to reach it:

| Entry | File | Used by |
|---|---|---|
| CLI (ESM) | `src/cli.mjs` | `npm run tsx-reader-export`, the repo itself |
| CLI (exe) | `src/cli-exe.mjs` | `dist/exe/tsx-reader-export.exe` — Node SEA build |
| Viewer | `viewer/main.mjs` | the Electron app; imports the same `core.mjs` |
| Smoke | `viewer/smoke.mjs` | headless verification of the viewer |

`core.mjs` takes injectable seams so a single implementation serves all of them:

- `load(spec)` — how to resolve `esbuild` / `react` / the shim. Defaults to
  `import()`. The SEA build passes a `createRequire()` loader because a
  single-executable app cannot `import()` third-party modules.
- `format` — `"esm"` normally, `"cjs"` for the exe. This matters: the SEA host
  `require()`s Mantine's **CJS** entry, so an ESM canvas bundle would import
  Mantine's **ESM** entry and get a *second* copy — the provider context would
  not match and rendering failed with *"MantineProvider was not found in
  component tree"*.
- `shimPath` / `tmpDir` — let a packaged host point at its own real paths.

## Why some things are duplicated on disk

`src/` is the single source of truth. Two build steps copy it:

```
npm run build:viewer   src/ -> viewer/src/          (needed by electron-builder)
npm run build:deploy   src/ -> deployment/win/src/  (deployment must stand alone)
```

Both destinations are **gitignored build artifacts**, not tracked copies. The
copies exist because of two hard constraints:

1. **electron-builder packages from its own root.** It will not reach into
   `../src`, and it prunes anything it cannot see in the dependency graph.
2. **`asar: false` is mandatory for the viewer.** The canvas is bundled at
   *runtime* by esbuild, which runs as a **separate process** and cannot read
   paths inside `app.asar`. The bundle also has to be written somewhere that can
   still resolve `node_modules`. An earlier `asar: true` build produced
   `ENOTDIR` because the temp path was computed inside `app.asar`, which is a
   file.

Related trap: **`@mantine/hooks` must be an explicit dependency.** It is a
*peer* dependency of `@mantine/core` and `@mantine/charts`. npm auto-installs
peers in development, so the dev build works, but electron-builder's pruner drops
it and the packaged app dies with `ERR_MODULE_NOT_FOUND`. Same reasoning applies
to any future peer dependency the renderer touches.

## Distribution

`npm run build:release` produces `release/`:

```
release/
  tsx-reader-export-viewer/      unpacked Electron app - no install, ~0.2s start
  tsx-reader-export.exe          CLI (Node SEA)
  node_modules/         required beside tsx-reader-export.exe
  cursor-canvas.compat.mjs
  run-cli.bat
```

**Why the viewer is unpacked, not a single "portable" exe.** The `portable`
target is a self-extracting archive: it unpacks ~200 MB into a fresh `%TEMP%`
directory on *every* launch. Measured **23.4s** to window, versus **0.45s**
cold / **0.18s** warm for the unpacked folder. Setting `portable.unpackDirName`
to pin a stable directory did **not** help (still 23.0s cold / 23.4s warm), so
that option was removed. The trade-off is size: ~307 MB unpacked vs a 76 MB
file. Both need no installation.

**Why the CLI exe is not single-file.** Node's SEA can only `require()` built-in
modules, so `react`, the shim and esbuild's native binary must exist on disk.
The win over the old `run.bat` + portable-Node flow is that no Node install
step is required; the cost is a sibling `node_modules/` folder.

## Generated vs committed

Committed: hand-written source, manifests, lockfiles, docs, testcases.

Generated (gitignored, rebuilt):

| Path | Regenerated by |
|---|---|
| `src/styles.generated.mjs` | `npm run embed-styles` (also runs on `npm install` via `prepare`) |
| `viewer/src/` | `npm run build:viewer` |
| `deployment/win/src/`, `deployment/win/testcases/` | `npm run build:deploy` |
| `viewer/build/icon.png` | `powershell -File scripts/make-icon.ps1` |
| `dist/`, `release/`, `viewer/dist/` | the `build:*` scripts |

After a fresh clone:

```bash
npm install          # prepare -> generates src/styles.generated.mjs
npm run check        # render every fixture
npm run sync         # viewer/src + deployment/win/src
```

## Diagnostics

Packaged GUI apps show no console, so both write a detailed log.

| App | Log |
|---|---|
| CLI exe | `dist/exe/logs/tsx-reader-export.log` (falls back to `%TEMP%`) |
| Viewer | `%APPDATA%\tsx-reader-export-viewer\viewer.log` |

Logs record argv, cwd, executable path, Node/Electron versions, the resolved
esbuild binary, whether the shim and `node_modules` were found, timings, and full
stack traces. Useful flags: `--verbose` (console echo), `--log <file>` (redirect).

`viewer.exe --smoke <canvas.tsx>` renders headlessly and exits, which is how the
**packaged** build gets verified — dev-mode tests cannot catch packaging
failures, as the missing-peer-dependency bug demonstrated.
