# Canvas Reader with HTML and PDF v1.0.0 — Windows release

Converts **Cursor canvas `.tsx`** files into **standalone static HTML**, and
previews them in a desktop viewer. No install, no Node.js required.

---

## Download

**`tsx-reader-export-1.0.0-windows-x64.zip`**

1. Extract the zip anywhere (e.g. `C:\tools\tsx-reader-export`).
2. That is it — nothing to install.

---

## What's in the zip

```
tsx-reader-export-1.0.0-windows-x64\
  tsx-reader-export-viewer\
    tsx-reader-export-viewer.exe     <- the GUI: double-click this
    ...                     <- app files (keep the folder together)
  tsx-reader-export.exe              <- the command line converter
  node_modules\             <- required by tsx-reader-export.exe (keep together)
  cursor-canvas.compat.mjs
  run-cli.bat
  README.txt
```

## The viewer (GUI)

Double-click `tsx-reader-export-viewer\tsx-reader-export-viewer.exe`.

| Action | How |
|---|---|
| Open a canvas | **Open .tsx** button, or drag-and-drop a `.tsx` onto the window |
| Preview | rendered live in the window |
| Save the result | **Save as HTML** — writes a self-contained `.html` |
| Print / export PDF | **Print / PDF** — opens the Windows print dialog; choose *Microsoft Print to PDF* or *Save as PDF* |

Starts in about **0.2 seconds** (the app folder is shipped unpacked on purpose —
a single-file "portable" build re-extracts ~200 MB on every launch and took 23s).

## The CLI

```bat
tsx-reader-export.exe my.canvas.tsx out.html
tsx-reader-export.exe my.canvas.tsx out.html --title "My Page"
tsx-reader-export.exe my.canvas.tsx out.html --color-scheme dark
tsx-reader-export.exe --help
```

`node_modules\` must stay next to `tsx-reader-export.exe` — the executable embeds the
Node runtime but loads React and the `cursor/canvas` shim from that folder.

Prefer a visible console? Use `run-cli.bat`.

## What you get

The output is a **single self-contained `.html` file** — all CSS is inlined, with
no external stylesheet links, so it opens offline and can be emailed or archived
as one file. It is fully rendered; it does not need React in the browser.

## Verify the download works

Both programs write a detailed log if anything goes wrong:

| Program | Log location |
|---|---|
| `tsx-reader-export.exe` | `logs\tsx-reader-export.log` next to it (or `%TEMP%`) |
| viewer | `%APPDATA%\tsx-reader-export-viewer\viewer.log` |

Headless self-check of the packaged viewer:

```bat
"tsx-reader-export-viewer\tsx-reader-export-viewer.exe" --smoke path\to\canvas.tsx
```

## Known issues

- **SmartScreen warning.** The binaries are unsigned. Choose
  *More info → Run anyway*. To avoid it entirely, right-click the `.exe` →
  *Properties* → tick **Unblock**.
- **Antivirus false positives.** Unsigned self-contained executables are
  sometimes flagged. The viewer is an *unpacked folder*, so you can also run
  `tsx-reader-export-viewer.exe` from `win-unpacked`-style layout without a wrapper.
- macOS and Linux builds are not included in this release.

## Requirements

- Windows 10 or later, 64-bit.
- No Node.js, no Python, no build tools.

## License

MIT — see [`LICENSE`](https://github.com/nkyang10/tsx-reader-export/blob/main/LICENSE).

Built on the public shim
[`@thisismydesign/cursor-canvas-web`](https://github.com/thisismydesign/cursor-canvas-web)
(MIT, © 2026 thisismydesign), which reimplements Cursor's virtual
`cursor/canvas` module so canvases can render outside the IDE.
