# Canvas Reader with HTML and PDF v1.1.0 — Windows release

Converts **Cursor canvas `.tsx`** files into **standalone static HTML**, and
previews them in a desktop viewer. No install, no Node.js required.

**The layout of the zip changed. See [Upgrading from v1.0.0](#upgrading-from-v100).**

---

## Download

**`tsx-reader-export-1.1.0-windows-x64.zip`**

1. Extract the zip anywhere (e.g. `C:\tools\tsx-reader-export`).
2. Double-click **`tsx-reader-export-viewer.exe`** — it is at the top level.
3. That is it — nothing to install.

---

## What's in the zip

```
tsx-reader-export-1.1.0-windows-x64\
  tsx-reader-export-viewer.exe     <- the reader: double-click this
  locales\  resources\
  *.pak  *.dll                     <- its runtime, keep them beside the exe
  cli\
    tsx-reader-export.exe          <- the command line converter
    node_modules\                  <- required by the CLI (keep together)
    cursor-canvas.compat.mjs
    run-cli.bat
  LICENSE
  README.txt
```

The loose `.pak` and `.dll` files at the top level are **Electron's runtime, not
clutter.** The app resolves them relative to its own exe, so they have to sit in
the same folder. Deleting them breaks the reader.

## The reader (GUI)

Double-click **`tsx-reader-export-viewer.exe`**.

| Action | How |
|---|---|
| Open a canvas | **Open .tsx** button, or drag-and-drop a `.tsx` onto the window |
| Preview | rendered live in the window |
| Save the result | **Save as HTML** — writes a self-contained `.html` |
| Print / export PDF | **Print / PDF** — opens the Windows print dialog; choose *Microsoft Print to PDF* or *Save as PDF* |

Starts in about **0.2 seconds** (the app is shipped unpacked on purpose — a
single-file "portable" build re-extracts ~200 MB on every launch and took 23s).

## The CLI

The CLI is for scripting. It now lives in the `cli\` subfolder:

```bat
cli\tsx-reader-export.exe my.canvas.tsx out.html
cli\tsx-reader-export.exe my.canvas.tsx out.html --title "My Page"
cli\tsx-reader-export.exe my.canvas.tsx out.html --color-scheme dark
cli\tsx-reader-export.exe --help
```

Every flag is unchanged from v1.0.0 — only the path to the executable moved.
`cli\node_modules\` must stay next to it: the executable embeds the Node runtime
but loads React and the `cursor/canvas` shim from that folder.

Prefer a visible console? Use `cli\run-cli.bat` — same arguments, and it pauses
so the output stays readable.

## Upgrading from v1.0.0

**Extract the new zip into a new folder.** Do not copy files over an old
install; two things moved.

| | v1.0.0 | v1.1.0 |
|---|---|---|
| The reader | `tsx-reader-export-viewer\tsx-reader-export-viewer.exe` | `tsx-reader-export-viewer.exe` (top level) |
| The CLI | `tsx-reader-export.exe` (top level) | `cli\tsx-reader-export.exe` |
| Source distribution | `deployment\win\` (source + `install.ps1`) | removed — the exe needs no Node and no install step |

If you scripted the CLI, update the path:

```bat
REM before
tsx-reader-export.exe report.canvas.tsx report.html
REM after
cli\tsx-reader-export.exe report.canvas.tsx report.html
```

Nothing about the conversion itself changed: same flags, same self-contained
`.html` output, byte-for-byte.

## What you get

The output is a **single self-contained `.html` file** — all CSS is inlined, with
no external stylesheet links, so it opens offline and can be emailed or archived
as one file. It is fully rendered; it does not need React in the browser.

## Verify the download works

Both programs write a detailed log if anything goes wrong:

| Program | Log location |
|---|---|
| reader | `%APPDATA%\tsx-reader-export-viewer\viewer.log` |
| `cli\tsx-reader-export.exe` | `cli\logs\tsx-reader-export.log` (or `%TEMP%`) |

Headless self-check of the packaged reader:

```bat
tsx-reader-export-viewer.exe --smoke path\to\canvas.tsx
```

## Smaller download

The release is **30 MB smaller** than v1.0.0. The CLI folder used to ship the
project's own build tools — the TypeScript compiler (22.5 MB) and `postject`
(4.6 MB, the tool that injects the executable) — which it never used. It now
carries only the runtime dependencies.

## Known issues

- **SmartScreen warning.** The binaries are unsigned. Choose
  *More info → Run anyway*. To avoid it entirely, right-click the `.exe` →
  *Properties* → tick **Unblock**.
- **Antivirus false positives.** Unsigned self-contained executables are
  sometimes flagged.
- macOS and Linux builds are not included in this release. A macOS tester build
  is produced in CI on a `v*` tag — see the repository README.

## Requirements

- Windows 10 or later, 64-bit.
- No Node.js, no Python, no build tools.

## License

MIT — see [`LICENSE`](https://github.com/nkyang10/tsx-reader-export/blob/main/LICENSE).

Built on the public shim
[`@thisismydesign/cursor-canvas-web`](https://github.com/thisismydesign/cursor-canvas-web)
(MIT, © 2026 thisismydesign), which reimplements Cursor's virtual
`cursor/canvas` module so canvases can render outside the IDE.
