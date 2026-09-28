# AGENTS.md — Project Rules

This file records the *rules and conventions* for working in this repository.
Every change should follow these rules unless a task explicitly overrides one.

## Project identity

Three names, deliberately kept apart. Do not collapse them.

| Role | Value | Used for |
| --- | --- | --- |
| **Long name** | `Canvas Reader with HTML and PDF` | README/doc titles, package descriptions, the release title |
| **Short name** | `Canvas Reader` | Window title, `productName`, Start-menu shortcut, CLI banner, prose |
| **Keyname** | `tsx-reader-export` | Every filename, package name, id, path, log and env var |

The keyname is the only one that may appear in a path or an identifier. A
person-facing surface (a window title, a Start-menu entry, a CLI banner) uses
the short or long name. Concretely:

- `productName: Canvas Reader` but `executableName: tsx-reader-export-viewer`
  in `viewer/electron-builder.yml` — that split is the whole point.
- `appId: dev.tsx-reader-export.viewer` stays a keyname forever, even if the
  display name changes again.
- `tsx-reader-export.exe`, `tsx-reader-export-viewer.exe`,
  `tsx-reader-export-1.0.0-windows-x64.zip`, `.tsx-reader-export-tmp/`,
  `tsx-reader-export.log`, `TSX_READER_EXPORT_*` are all keynames.
- The repository, the npm package and the working directory are keynames too.

- **Repository:** `nkyang10/tsx-reader-export`
  <https://github.com/nkyang10/tsx-reader-export>
- **npm package name:** `tsx-reader-export` · **Viewer app:** `tsx-reader-export-viewer`
- **License:** MIT (see [`LICENSE`](LICENSE))
- The repository history was **reset to a single commit** after a fixture
  containing internal infrastructure data was found in it. The pre-rewrite
  branch was deleted locally and the object store pruned, so there is exactly
  one commit and no unreachable objects. Do not reintroduce real-world data —
  see rule 10.

## Project purpose

Canvas Reader converts **Cursor canvas `.tsx` files to standalone static HTML**.
A canvas is a `.tsx` file that imports UI primitives from the virtual module
`cursor/canvas` (Callout, H1, H2, Row, Stack, Stat, Text, useHostTheme, ...).

The tool bundles the canvas with esbuild, aliases `cursor/canvas` to a shim,
renders it server-side with React, and emits a single self-contained `.html`
(with all CSS inlined — no external CDN dependency).

It ships two artifacts: a **CLI** (`tsx-reader-export.exe`) and an **Electron viewer**
that opens, previews, saves and prints a canvas.

## Tech stack

- **Node.js** (>= 18) + ESM (`"type": "module"`).
- **esbuild** — bundling/transpiling.
- **React / react-dom** — server-side rendering.
- **@thisismydesign/cursor-canvas-web** — public shim for `cursor/canvas`
  (Mantine-based components + `CanvasRoot` runtime wrapper).
- Source files are plain `.mjs` and avoid JSX (JSX lives only inside user
  canvas files, which esbuild compiles).

## Repository layout

`src/` is the **single source of truth**. Everything else is either
hand-written or generated.

- `src/` — the tool source (hand-written, committed).
  - `core.mjs` — bundling + SSR rendering + HTML assembly. Exposes injectable
    seams (`load`, `format`, `shimPath`, `tmpDir`) so one implementation serves
    the CLI, the exe build and the viewer.
  - `cli.mjs` — command-line entry point (ESM).
  - `cli-exe.mjs` — entry point for the single-file `.exe` (Node SEA).
  - `cursor-canvas.compat.mjs` — re-exports the shim and augments
    `useHostTheme()` with `theme.category` (the real SDK exposes it; the
    public shim does not). Keep the two token surfaces consistent.
  - `styles.generated.mjs` — **generated**, gitignored, rebuilt by
    `npm run embed-styles` (also runs via `prepare` on `npm install`).
- `scripts/` — build/maintenance scripts, all `.mjs` except
  `make-icon.ps1`.
- `testcases/` — canonical fixtures the tool must render.
- `viewer/` — cross-platform **Electron tsx viewer**: opens a `.tsx`, previews
  it in-window, saves as HTML, prints/PDFs via the system print dialog.
  `viewer/src/` is a **generated** copy of `src/` (gitignored).
- `deployment/win/` — **removed.** It was a third way to ship the CLI (source +
  `install.ps1` that downloaded portable Node + `npm ci`), strictly worse than
  the SEA exe, which needs no Node and no install step. Do not bring it back.
- `docs/architecture.md` — how it fits together and why (read this first).
- `docs/engineering-log.md` — dated log of every change.
- `.env` — local secrets (git-ignored). `.env.example` documents it.

## Commands

```bash
npm install            # also regenerates src/styles.generated.mjs (prepare)
npm run check          # render every fixture in testcases/ -> out/
npm run sync           # copy src/ into viewer/src/
node src/cli.mjs <canvas.tsx> <out.html> [--title "T"]

npm run build:exe      # CLI exe + prod deps  -> release/cli/
npm run build:release  # both artifacts       -> release/
npm run viewer         # launch the Electron viewer
```

## Scratch vs shipped output

Two folders, one rule: **`out/` is scratch, `release/` ships.** There is no
`dist/` and no staging tree.

- `out/` — gitignored. `npm run check` renders, the smoke test screenshots,
  `npm run capture -- --pdf` writes the sample PDF. Safe to delete at any time.
- `release/` — gitignored, the distributable. `build:exe` writes `release\cli\`
  **in place**; `build:release` adds the viewer beside it. `dist\exe\` used to
  exist as a duplicate that was copied across — do not reintroduce a staging
  copy of a shipped artifact.

## Rules

1. **Never commit secrets.** API keys/tokens live only in `.env` (git-ignored).
   Do not hard-code keys in source or commit them. Use `.env.example` as the
   template.
2. **Never commit generated files.** `src/styles.generated.mjs`,
   `viewer/src/`, `viewer/LICENSE`, `viewer/build/`, and everything under
   `out/`, `release/`, `viewer/dist/`, `.tsx-reader-export-tmp/` are
   build outputs. Edit the source and re-run the relevant `build:*` script
   instead. `docs/images/` is the one deliberate exception — see rule 12.
3. **Keep a single React instance.** Canvas bundles must externalize
   `react`, `react-dom`, and the UI libs so they share the host process's copy
   (avoids "Invalid hook call"). Never inline React into the runtime bundle.
   The exe build additionally needs `format: "cjs"` so the host and the canvas
   resolve the same CJS entries — see `docs/architecture.md`.
4. **Output must be self-contained.** Inline all CSS; no CDN `<link>`s.
5. **Declare peer dependencies explicitly.** npm auto-installs peers in dev, but
   electron-builder prunes them, so anything the renderer imports (e.g.
   `@mantine/hooks`) must be a real entry in `dependencies`.
6. **Windows first.** Cross-platform is the goal, but the primary target and
   the deployment artifact are Windows. Test every change on Windows.
7. **Every change is logged** in `docs/` (append to the engineering log with a
   date + rationale). Keep a paper trail.
8. **Minimal comments** in code; document intent in `AGENTS.md`/`docs/` instead.
9. **Test before finishing.** Every task must run `npm run check` (renders every
   fixture in `testcases/`) and verify the HTML output.
10. **Never commit real-world or internal data.** This repository is public.
    That includes customer data, internal hostnames, private/internal IP
    addresses, product or customer names, internal API or host identifiers,
    ports and infrastructure topology, and anything lifted from a real work
    log. `testcases/` must contain **synthetic** fixtures only — write one
    from scratch rather than copying a real canvas. If a change ever needs
    illustrative content, invent it.
11. **Never quote sensitive values, even to document a removal.** When logging
    an incident in `docs/`, describe the data *generically* ("a private IP",
    "an internal hostname"). Writing the literal value into a commit, a log
    entry or a commit message puts it straight back into history — that mistake
    was made here once already.
12. **Screenshots may be committed, but only from the synthetic fixture.** A
    rendered canvas is that canvas's data as pixels, and no text scan can find
    it — the first version of this rule existed because a screenshot of a
    private fixture was committed with it. `docs/images/` is now tracked and
    the README uses it, with these constraints:
    - `npm run capture` writes **only** the repository's own
      `testcases/example.canvas.tsx` into `docs/images/`. It refuses any other
      canvas and tells you to set `CAPTURE_OUT` for a throwaway capture.
    - Never point the committed images at a real canvas. The guard in
      `viewer/capture.mjs` is the backstop, not the permission.
    - Re-run `npm run capture` and re-read the rendered HTML's text before
      committing an updated image. Verify the source canvas, not just the
      pixels.
13. **Scan before pushing.** Before any commit that opens, re-opens or
    publishes the repository, grep the staged tree for private IPv4 ranges
    (`10/8`, `192.168/16`, `172.16-31`), email addresses, token shapes
    (`github_pat_…`, `xox*-…`, `api_key`/`secret`/`token` assignments) and any
    internal identifier you are aware of. Verify the *staged* content, not just
    the working tree.

## Security reporting

Report vulnerabilities privately per [`SECURITY.md`](SECURITY.md). Note for
maintainers: canvases are **executed** (bundled and server-rendered), not
parsed, so only convert files you trust.

## Deployment model (Windows)

`npm run build:release` writes the whole Windows distribution into `release/`:
the unpacked reader at the top level, the CLI in `release\cli\`. Neither needs
an installer or a Node install. See "Scratch vs shipped output" above for the
layout and `docs/architecture.md` for why the reader sits at the root.

## Deployment model (viewer)

`viewer/` is a cross-platform **Electron** app. `npm --prefix viewer run start`
(or `npm run viewer` from the root) opens the viewer; it renders any `.tsx` with
the same core as the CLI, previews it in-window, and can save as HTML or print
via the OS print dialog. Package distributables with electron-builder
(`npm run viewer:dist`; targets Windows nsis/portable, macOS dmg, Linux AppImage).
**macOS cannot be built on Windows or Linux** — electron-builder throws
`Build for macOS is supported only on macOS` for a macOS target on a non-macOS
host, with no flag to bypass it. Build it with
`.github/workflows/release-macos.yml` instead.
Run `npm run build:viewer` after changing root `src/` to re-sync
`viewer/src/`. Keep the viewer's `src/` in sync with the root `src/`.

## Cross-platform

This is a **cross-platform program**. The core CLI and the Electron viewer both
run on Windows, macOS, and Linux from the same source. Windows is the primary
tested target and the shipped distribution, but nothing in `src/` or `viewer/`
is Windows-specific — the only platform-specific pieces are the Windows
executable build and its batch wrapper. When changing rendering or the viewer,
keep it portable and avoid Windows-only APIs (use `path`/`fs` cross-platform
APIs, not `\\`-hardcoded separators).
