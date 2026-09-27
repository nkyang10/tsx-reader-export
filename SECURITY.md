# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately via
[GitHub Security Advisories](https://github.com/nkyang10/tsx-reader-export/security/advisories/new)
("Report a vulnerability"), or by email to the maintainer if you prefer.

Include, if you can:

- the version affected,
- your OS and Node version,
- reproduction steps or a sample `.tsx` that triggers it,
- the full contents of the relevant log file (CLI:
  `logs/tsx-reader-export.log`; viewer: `%APPDATA%\tsx-reader-export-viewer\viewer.log`) — these
  may contain local paths, so review before sharing.

You can expect an acknowledgement within a few days. Fixes for confirmed issues
ship in a patch release, and the advisory is published after a fix is available.

## Threat model

Canvas Reader is a build-time converter: it takes a `.tsx` file you already have and
writes a static HTML file. It is not a server and exposes no network surface.

That said, some things are worth knowing:

- **Canvases are executed, not parsed.** The input `.tsx` is bundled and
  server-rendered, so it runs as JavaScript with Node's privileges. Only convert
  canvases you trust — the same rule as running any build script. Do not convert
  a canvas downloaded from an untrusted source.
- **The viewer previews untrusted HTML** in an isolated renderer
  (`contextIsolation: true`, `nodeIntegration: false`) and loads it as a
  `srcdoc` document, so canvas JavaScript cannot reach the app's own context.
  Keep those settings on.
- **Generated HTML is static.** It inlines all CSS and ships no script from the
  converter, so the output works offline and pulls nothing from the network.
- **Binaries are unsigned.** Verify the SHA-256 checksum published with a
  release if the download came from somewhere other than the official releases
  page.

## Out of scope

- Vulnerabilities in upstream dependencies (React, Mantine, esbuild, Electron).
  Report those to their maintainers; we track them and will update.
- Rendering a malicious canvas you were asked to convert.
- Lack of code signing on our own release binaries.
