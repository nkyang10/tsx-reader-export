# Canvas Reader with HTML and PDF v1.2.0 — Windows release

Converts **Cursor canvas `.tsx`** files into **standalone static HTML**, and
previews them in a desktop viewer. No install, no Node.js required.

**The exported page is no longer black if your Windows is in dark mode.** Same
zip layout as v1.1.0, same flags, same CLI path.

---

## Download

**`tsx-reader-export-1.2.0-windows-x64.zip`**

1. Extract the zip anywhere (e.g. `C:\tools\tsx-reader-export`).
2. Double-click **`tsx-reader-export-viewer.exe`** — it is at the top level.
3. That is it — nothing to install.

---

## What's in the zip

```
tsx-reader-export-1.2.0-windows-x64\
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

## Light or dark: pick the theme the canvas had in Cursor

A canvas `.tsx` does **not** record whether it was drawn in Cursor's light or
dark theme. It reads its colours from the Cursor host theme while it renders, so
the file on disk is theme-agnostic and the look depends entirely on the host.

Until v1.2.0 the export only half-supplied that, which produced the bug below.

**In the reader** — the **Theme** dropdown in the toolbar:

| Choice | What you get |
|---|---|
| **Light** | the light Cursor theme, always |
| **Dark** | the dark Cursor theme, always |
| **Match system** | follows the reader's Windows light/dark setting |

Your choice is remembered between sessions. Changing it re-renders (a moment's
wait) rather than restyling, because the colours are baked into the HTML at
render time.

**From the CLI** — the same choice as a flag:

```bat
cli\tsx-reader-export.exe my.canvas.tsx out.html
cli\tsx-reader-export.exe my.canvas.tsx out.html --color-scheme dark
cli\tsx-reader-export.exe my.canvas.tsx out.html --color-scheme auto
```

`light` (default) and `dark` are pinned: the file looks the same on every
machine. `auto` follows whoever opens it, which is what you want for a link you
are sharing, and what you do not want for a PDF.

## The fix: the background was following your OS

The exported HTML is a Mantine page, and Mantine does not publish literal
colours — every one of them is a `var(--mantine-color-*)` defined by a block
scoped to an attribute on the root element:

```css
:root[data-mantine-color-scheme='light'] { --mantine-color-body: var(--mantine-color-white); }
:root[data-mantine-color-scheme='dark']  { --mantine-color-body: var(--mantine-color-dark-7); }
```

The export never wrote that attribute, because a server render has no browser to
set it. So `--mantine-color-body` was undefined, the page background fell back
to transparent, and the browser painted the canvas from `color-scheme: light
dark` — which is to say, from your Windows setting. Hence light content on a
black page for anyone using dark mode.

The export now writes the attribute and a matching `<meta name="color-scheme">`,
so the page is white on a light machine *and* on a dark one. Verified by reading
computed styles out of the rendered file with the OS theme forced both ways:

| Export | reader in dark mode | reader in light mode |
|---|---|---|
| v1.1.0 | `transparent` → **black** | `transparent` → white |
| v1.2.0, default | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` |
| v1.2.0, `--color-scheme dark` | `rgb(36, 36, 36)` | `rgb(36, 36, 36)` |
| v1.2.0, `--color-scheme auto` | `rgb(36, 36, 36)` | `rgb(255, 255, 255)` |

This also means `--color-scheme` does something for the first time. In v1.0.0 and
v1.1.0 it was accepted, passed to the renderer, and then ignored.

## Upgrading from v1.1.0

Extract the new zip into a new folder (or over the old one — **nothing moved**
this time; the reader is still at the top level and the CLI is still in `cli\`).

Nothing about the CLI changed: same executable, same flags, same paths. The only
difference is that `--color-scheme` now reaches the output.

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

## Known issues

- **SmartScreen warning.** The binaries are unsigned. Choose
  *More info → Run anyway*. To avoid it entirely, right-click the `.exe` →
  *Properties* → tick **Unblock**.
- **Antivirus false positives.** Unsigned self-contained executables are
  sometimes flagged.
- macOS and Linux builds are not included in this release. A macOS tester build
  is produced in CI on a `v*` tag — see the repository README.
- The reproduced themes are the standard Cursor light and dark themes. A
  *custom* Cursor theme is not carried in the `.tsx`, so it cannot be reproduced
  — pick the closest built-in scheme.

## Requirements

- Windows 10 or later, 64-bit.
- No Node.js, no Python, no build tools.

## License

MIT — see [`LICENSE`](https://github.com/nkyang10/tsx-reader-export/blob/main/LICENSE).

Built on the public shim
[`@thisismydesign/cursor-canvas-web`](https://github.com/thisismydesign/cursor-canvas-web)
(MIT, © 2026 thisismydesign), which reimplements Cursor's virtual
`cursor/canvas` module so canvases can render outside the IDE.
