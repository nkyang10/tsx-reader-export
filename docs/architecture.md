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
| CLI (exe) | `src/cli-exe.mjs` | `release/cli/tsx-reader-export.exe` — Node SEA build |
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

## Why `src/` is duplicated into `viewer/src/`

`src/` is the single source of truth. One build step copies it:

```
npm run build:viewer   src/ -> viewer/src/   (needed by electron-builder)
```

The destination is a **gitignored build artifact**, not a tracked copy. It
exists because of two hard constraints:

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
  tsx-reader-export-viewer.exe  Canvas Reader, the app - double-click this
  locales/  resources/  *.pak  *.dll   its unpacked Electron runtime
  cli/
    tsx-reader-export.exe       CLI (Node SEA)
    node_modules/               required beside tsx-reader-export.exe
    cursor-canvas.compat.mjs
    run-cli.bat
  LICENSE  README.txt
```

**Why the reader is at the top level and the CLI is not.** The reader is the
product, so its exe is what you open. An unpacked Electron app cannot be a
single file: it resolves `locales/`, `resources/` and the `*.pak`/`*.dll`
siblings relative to the exe, so those have to sit at the top level too. The
root therefore looks busy — that is Electron's runtime, not clutter. The CLI is
the secondary entry point, so it takes the one subfolder. It resolves nothing
outside its own directory (`src/cli-exe.mjs` derives every path from
`process.execPath`), so it is self-contained there.

**Why `release/cli/` is built in place, with no staging copy.** `build:exe`
writes straight to `release/cli/`, and `build:release` wipes everything in
`release/` *except* that folder before laying the viewer in beside it. There
used to be a `dist/exe/` that `build:release` then copied across — a second
130 MB tree on disk and a full copy of ~13,000 files per release build, for no
benefit. There is now no `dist/` at all: `out/` is scratch, `release/` ships.

**Why the shipped `node_modules/` is production-only.** Copying the dev
`node_modules` into `release/cli/` also shipped `typescript` (22.5 MB),
`postject` (4.6 MB, the tool that injects the SEA blob) and `@types/node` —
**30.4 MB, 42% of the folder**, none of which the exe ever loads.
`scripts/build-cli-exe.mjs` now runs `npm ci --omit=dev` into a staging folder
and moves the result into place, so npm — not a hand-maintained delete list —
decides what is dev-only, and it stays correct when a devDependency is added.
`--ignore-scripts` is safe because the only postinstall in the production
closure is esbuild's, which merely validates the binary that already ships as
an optionalDependency. electron-builder was already doing this for the viewer;
the CLI was the one place that had not caught up.

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

## macOS is built in CI, not on the dev box

electron-builder **refuses** a macOS target on a non-macOS host.
`app-builder-lib/out/packager.js` throws `Build for macOS is supported only on
macOS` when the target platform is `mac` and the host is `win32`, and the check
is unconditional — no flag or environment variable bypasses it. It is also not
worth patching around: `app-builder-bin` ships only the binary for the *host*
platform, so the darwin `app-builder` a Windows box would have to exec is not on
disk, and the mac-specific steps (icns, plist, dmg) shell out to macOS tooling.

`.github/workflows/release-macos.yml` therefore builds it on `macos-latest`
(tag push `v*`, or manual dispatch). Two consequences shape the workflow:

- **The icon is generated on a Windows job.** `viewer/build/` is gitignored, so
  a clean checkout has no `icon.png`; electron-builder would only warn and fall
  back to the default Electron icon, producing a build that succeeds and looks
  wrong. `scripts/make-icon.ps1` cannot move to macOS — it draws with
  `System.Drawing`, which is Windows-only and unavailable to `pwsh` on macOS —
  so a `windows-latest` job runs it and uploads the PNG for the macOS job.
- **The build is unsigned**, by choice: no Apple Developer certificate means no
  secrets, so it runs on a fork. `mac.identity: null` also stops electron-builder
  auto-discovering a keychain certificate, which would otherwise make a local mac
  build differ from the CI one. Testers clear Gatekeeper once by hand.

The x64 job then runs `--smoke` on the packaged app, so the packaged mac build is
rendered once on a real Mac using the synthetic fixture. That catches packaging
failures — the missing-peer-dependency class of bug in "Why some things are
duplicated on disk" — and is *not* a substitute for testing on real Apple
hardware. The arm64 job is not smoke-tested: the runner is x64.

There is no macOS CLI artifact. The `.exe` is a Node SEA build, which is
Windows-only; a mac user runs the viewer, or the CLI from source with
`node src/cli.mjs`.

## Generated vs committed

Committed: hand-written source, manifests, lockfiles, docs, testcases.

Generated (gitignored, rebuilt):

| Path | Regenerated by |
|---|---|
| `src/styles.generated.mjs` | `npm run embed-styles` (also runs on `npm install` via `prepare`) |
| `viewer/src/` | `npm run build:viewer` |
| `viewer/build/icon.png` | `powershell -File scripts/make-icon.ps1` |
| `release/`, `viewer/dist/` | the `build:*` scripts |
| `out/` (scratch) | `npm run check`, the smoke test, `npm run capture -- --pdf` |

After a fresh clone:

```bash
npm install          # prepare -> generates src/styles.generated.mjs
npm run check        # render every fixture
npm run sync         # viewer/src
```

## Diagnostics

Packaged GUI apps show no console, so both write a detailed log.

| App | Log |
|---|---|
| CLI exe | `release\cli\logs\tsx-reader-export.log` (falls back to `%TEMP%`) |
| Viewer | `%APPDATA%\tsx-reader-export-viewer\viewer.log` |

Logs record argv, cwd, executable path, Node/Electron versions, the resolved
esbuild binary, whether the shim and `node_modules` were found, timings, and full
stack traces. Useful flags: `--verbose` (console echo), `--log <file>` (redirect).

`viewer.exe --smoke <canvas.tsx>` renders headlessly and exits, which is how the
**packaged** build gets verified — dev-mode tests cannot catch packaging
failures, as the missing-peer-dependency bug demonstrated.
