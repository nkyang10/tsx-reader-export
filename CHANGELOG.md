# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-09-29

A canvas does not carry its own theme, so the export has to be told which one —
and until now it never was. The same HTML rendered black on a dark-mode machine
and white on a light-mode one, and `--color-scheme` did nothing at all. Both are
fixed, and the viewer can now ask.

### Added

- **A Theme control in the viewer** (`Light` / `Dark` / `Match system`), so the
  canvas can be previewed, saved and printed in the theme it was drawn in. The
  choice is remembered between sessions. Switching it re-renders rather than
  restyles, because the shim's token palette is baked into the HTML at render
  time — the control sends the scheme to the render, it does not toggle a class
  on the iframe.

### Fixed

- **The exported page's background is no longer black on dark-mode readers.**
  The export never stamped `data-mantine-color-scheme` onto `<html>`, which is
  where Mantine resolves *every* design token. With the attribute missing,
  `--mantine-color-body` was undefined, `body`'s `background-color` collapsed to
  transparent, and the page canvas was painted by the browser from Mantine's
  `color-scheme: light dark` — black for anyone whose OS is in dark mode. The
  chosen scheme is now written to the attribute and to a `<meta name="color-scheme">`,
  so the same HTML is white on a light machine and on a dark one. This also
  makes `--color-scheme` actually do something: it was a no-op before.
  - `auto` bakes in `light` (so the page is readable with scripting off) and
    upgrades to `dark` via a two-line inline script when the reader's OS asks
    for it.
  - An unrecognised value now fails with
    `Invalid color scheme: <v>. Expected one of: light, dark, auto.` instead of
    being passed through to Mantine.

**Upgrading:** nothing moves and no flag is renamed — extract the new zip over
the old folder (or into a new one). Full details in
[`docs/release-notes-1.2.0.md`](docs/release-notes-1.2.0.md).

## [1.1.0] - 2026-09-28

The reader is the product, and the download now says so: it is the exe at the
top level of the zip, and the CLI is the thing in the subfolder. The release is
also 30 MB smaller.

**Upgrading:** extract the new zip into a new folder rather than copying files
over an old install — the reader and the CLI both moved. Full details in
[`docs/release-notes-1.1.0.md`](docs/release-notes-1.1.0.md).

### Added

- **macOS viewer builds in CI** (`.github/workflows/release-macos.yml`) — the
  `.app` is packaged on a `macos-latest` runner on a `v*` tag or manual
  dispatch, as both `dmg` and `zip` for `x64` and `arm64`. electron-builder
  refuses a macOS target on a non-macOS host, so a Windows dev box cannot produce
  this; the workflow is the only supported route.
  - The build is **unsigned** — no Apple Developer certificate, therefore no
    secrets and it runs on a fork. Testers clear Gatekeeper once: right-click the
    app → *Open*, or
    `xattr -dr com.apple.quarantine "/Applications/Canvas Reader.app"`.
  - The app icon is drawn by a `windows-latest` job and handed to the macOS job,
    because `viewer/build/` is gitignored and `make-icon.ps1` needs
    `System.Drawing`, which does not exist on macOS.
  - The packaged `x64` app is rendered once with `--smoke` against the synthetic
    fixture, so packaging failures surface in CI.

### Changed

- **The reader is the headline feature, so it is no longer in a subfolder.** The
  Windows release used to ship the CLI's files at the top level and the app
  tucked away in `tsx-reader-export-viewer\`. `npm run build:release` now
  flattens the unpacked Electron app into the root of the zip, so
  `tsx-reader-export-viewer.exe` is the first thing you see, and the CLI moves
  down to `cli\`:

  ```
  release/
    tsx-reader-export-viewer.exe   <- the app
    locales\  resources\  *.pak  *.dll   <- its Electron runtime, keep them
    cli\tsx-reader-export.exe  cli\run-cli.bat  cli\node_modules\
  ```

  The root looks busier than before: an unpacked Electron app resolves
  `locales\`, `resources\` and its `.pak`/`.dll` siblings relative to the exe, so
  they cannot be moved into a folder of their own. Nothing in the CLI reads
  paths outside its own directory, so it relocated unchanged. **Upgrading:** the
  exe you double-click and the CLI's location both changed — re-extract the zip
  rather than copying files over an old install.
- **The shipped CLI no longer carries the dev toolchain.** `build:exe` copied the
  development `node_modules` verbatim, so `release\cli\` shipped `typescript`
  (22.5 MB), `postject` (4.6 MB — the tool that injects the SEA blob) and
  `@types/node`: **30.4 MB, 42% of the folder**, none of which the exe loads.
  It now runs `npm ci --omit=dev` into a staging folder, so npm decides what is
  dev-only rather than a hand-maintained delete list. 72.1 MB → 42.3 MB; the
  release is 30 MB smaller.
- **`dist/` is gone.** Two output folders now: `out/` is scratch (renders, smoke
  screenshots, the sample PDF) and `release/` ships. `build:exe` writes
  `release\cli\` **in place** and `build:release` wipes everything else in
  `release\` before laying the viewer in beside it. The old `dist\exe\` was a
  second 130 MB tree that existed only to be copied across — a full copy of
  ~13,000 files per release build, for no benefit.
- **Removed `deployment/win/`.** It shipped the CLI a third way: source plus an
  `install.ps1` that downloaded a portable Node.js and ran `npm ci`. The SEA exe
  needs no Node, no install step and no network, so this was strictly the worse
  mechanism for the same output. Deletes `scripts/build-deploy.mjs`, the
  `build:deploy` script, and the `build:deploy` half of `npm run sync` (which is
  now just `build:viewer`).
- `mac.artifactName` is now `${name}-${version}-mac-${arch}.${ext}` instead of
  being unset, which would have put the display name "Canvas Reader" in a
  filename. macOS artifacts now carry the keyname, matching the `win` block.
- `mac.identity: null`, so a local mac build with a certificate in the keychain
  matches the CI build rather than being signed differently.

### Removed

- `deployment/win/` and `scripts/build-deploy.mjs`, plus the `build:deploy` npm
  script. See the Changed entry for why the SEA exe supersedes it.
- The root `dist/` folder. `out/` is scratch, `release/` ships.

## [1.0.0] - 2026-09-26

First stable release. Converts Cursor canvas `.tsx` files to standalone static
HTML, with a cross-platform Electron viewer.

### Naming

The project is **Canvas Reader** (long form: *Canvas Reader with HTML and PDF*).
`tsx-reader-export` is the keyname and survives only in filenames, package
names, ids and paths — the viewer ships as `productName: Canvas Reader` with
`executableName: tsx-reader-export-viewer`, so people see "Canvas Reader" while
the file on disk keeps the keyname. See "Project identity" in `AGENTS.md`.

### Added

- **Rendering core** (`src/core.mjs`) — bundles a canvas with esbuild, aliases
  the virtual `cursor/canvas` module to the public shim, and server-renders it
  with `renderToStaticMarkup`. Output is a single self-contained `.html` with all
  CSS inlined and **zero** external stylesheet links.
- **`cursor/canvas` compatibility layer**
  (`src/cursor-canvas.compat.mjs`) — re-exports
  `@thisismydesign/cursor-canvas-web` and augments `useHostTheme()` with a
  `category` token group that the real Cursor SDK exposes but the public shim
  omits.
- **CLI** (`src/cli.mjs`) — `<input.tsx> [output.html] [--title T]
  [--color-scheme light|dark]`, plus `-o/--output` and `-h/--help`.
- **Electron viewer** (`viewer/`) — opens a `.tsx`, previews it in-window, saves
  as self-contained HTML, and prints via the **OS print dialog** (Windows:
  *Microsoft Print to PDF* / *Save as PDF*). Supports drag-and-drop.
- **Windows `.exe` distribution** — `tsx-reader-export.exe` built with Node's Single
  Executable Application (embedds the Node runtime, so no Node install is
  needed) and an unpacked viewer app folder.
- **Cross-platform deployment scripts** — `deployment/win/` with `install.ps1`
  (provisions a portable Node) and `run.bat`.
- **Diagnostics** — every run writes a detailed log (argv, cwd, exe path,
  Node/Electron versions, resolved esbuild binary, shim/module presence,
  timings, full stack traces). `--verbose` and `--log <file>` supported.
  `viewer.exe --smoke <canvas>` verifies a packaged build headlessly.
- **Documentation** — `AGENTS.md` (project rules), `docs/architecture.md`
  (design and constraints), `docs/engineering-log.md` (dated change log).
- **Repository hygiene** — generated files (`src/styles.generated.mjs`,
  `viewer/src/`, `deployment/win/src/`) are no longer committed; `npm install`
  regenerates the styles via a `prepare` hook and `npm run sync` rebuilds the
  copies.
- **App icon** — generated by `scripts/make-icon.ps1`; the viewer no longer
  falls back to the default Electron icon.

### Fixed

- Viewer window never appeared: `webUtils` was imported as a named ESM export
  but does not exist in the pinned Electron build, so the whole main process
  failed at load. Drag-and-drop was rewritten to send file contents over IPC
  instead of relying on `File.path`/`webUtils`.
- Packaged viewer failed with `ENOTDIR`: `core.mjs` wrote its runtime bundle
  inside `app.asar`, which is a file. `asar: false` is now set — required
  anyway because esbuild runs as a separate process and cannot read inside
  `.asar`.
- Packaged viewer failed with `ERR_MODULE_NOT_FOUND: @mantine/hooks` — it is a
  *peer* dependency of Mantine, auto-installed by npm in development but pruned
  by electron-builder. Now an explicit dependency in all three manifests.
- Single-executable CLI failed with *"MantineProvider was not found in
  component tree"*: the host `require()`d Mantine's CJS entry while the ESM
  canvas bundle imported its ESM entry, producing two instances. The canvas is
  now built as CommonJS for the exe path.
- Viewer startup reduced from **23.4s to ~0.2s** by shipping the unpacked build
  instead of the self-extracting `portable` exe, which re-extracts ~200 MB on
  every launch.

### Known limitations

- Binaries are **unsigned**; Windows SmartScreen warns on first run.
- The CLI `.exe` is not a single file — Node's SEA can only `require()` built-in
  modules, so `node_modules/` must sit beside it.
- macOS `.dmg` and Linux AppImage builds are configured but were not produced or
  tested on this Windows-only release.
- No CI yet; packaged-artifact regressions are caught manually via `--smoke`.

[1.0.0]: https://github.com/nkyang10/tsx-reader-export/releases/tag/v1.0.0
