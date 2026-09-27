# Canvas Reader — Windows (self-contained)

This folder is a self-contained distribution of Canvas Reader. Everything
you need to run it is here — no global Node.js install or internet access is
required after setup.

## What's inside

- `src/` — the tool source (bundling, SSR, shim compat, embedded Mantine CSS).
- `testcases/` — demo canvas `.tsx` fixtures.
- `package.json` — locked dependencies.
- `install.ps1` — one-time setup (downloads a portable Node.js if needed).
- `run.bat` — the entry point.

## Two ways to run

### Option A — `run.bat` (no build required)

1. **One-time setup** — right-click `install.ps1` → *Run with PowerShell*,
   or from a terminal:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

   This downloads a portable Node.js into `.\node\` (if you don't already have
   one) and runs `npm ci` to populate `node_modules\`.

2. **Convert a canvas**:

   ```bat
   run.bat testcases\example.canvas.tsx preview.html --title "My Canvas"
   ```

### Option B — single-file `tsx-reader-export.exe` (built from source)

From the repo root:

```bash
npm run build:exe
```

This produces `dist/exe/` containing `tsx-reader-export.exe` (Node runtime embedded) plus
a `node_modules\` folder. Copy the whole `dist\exe\` folder to any Windows
machine — **no Node.js install needed** — and run:

```bat
dist\exe\tsx-reader-export.exe my.canvas.tsx preview.html
```

Keep `tsx-reader-export.exe` and its sibling `node_modules\` together.

## Troubleshooting

**"I double-clicked it and nothing happened."**
A console `.exe` run from Explorer normally flashes and closes. Both apps now
handle this:

- `tsx-reader-export.exe` with no arguments prints usage and **waits for a keypress**.
- Use `run-cli.bat` if you want a guaranteed console window.
- The **viewer** shows a window; if it does not, check the log below.

**Logs (full detail, always written):**

| App | Log location |
|---|---|
| CLI `.exe` | `dist\exe\logs\tsx-reader-export.log` (or `%TEMP%\tsx-reader-export.log`) |
| Viewer | `%APPDATA%\tsx-reader-export-viewer\viewer.log` |
| CLI source | `logs\tsx-reader-export.log` next to the tool |

Each log records the arguments, working directory, executable path, Node /
Electron versions, the resolved esbuild binary, whether the shim and
`node_modules` were found, timings, and the **full stack trace** on failure.

**Useful flags:**

```bat
tsx-reader-export.exe my.canvas.tsx out.html --verbose     REM echo progress
tsx-reader-export.exe my.canvas.tsx --log C:\temp\run.log REM custom log path
```

**Self-check the packaged viewer without using the GUI:**

```bat
"tsx-reader-export-viewer-0.1.0-win-x64.exe" --smoke path\to\canvas.tsx
```

## Notes

- `run.bat` uses `.\node\node.exe` if present, otherwise your system `node`.
- The output HTML is static — it does not hydrate or run React in the browser.
- Both the .exe and the viewer app are **unsigned**, so Windows SmartScreen may
  warn on first run.
