# Contributing

Thanks for your interest. This project is small and the bar for a change is
simple: keep `src/` correct, keep the output self-contained, and log what you
did.

## Setup

```bash
git clone https://github.com/nkyang10/tsx-reader-export.git
cd tsx-reader-export
npm install          # also generates src/styles.generated.mjs (prepare hook)
npm run check        # render every fixture in testcases/
```

Requires **Node.js 18+**. Windows is the primary tested target; the core is
platform-neutral ESM, so please avoid Windows-only APIs outside
`deployment/win/` and `scripts/make-icon.ps1`.

## The workflow

1. **Edit `src/` only.** `viewer/src/` and `deployment/win/src/` are generated
   copies — never edit them by hand.
2. **Run `npm run check`.** It regenerates the embedded styles and renders every
   fixture. A change is not done until this passes.
3. **Sync the copies** with `npm run sync` if you touched `src/` or
   `testcases/`.
4. **Log the change** — append an entry to
   [`docs/engineering-log.md`](docs/engineering-log.md) with a date and the
   rationale. Rule #6 in [`AGENTS.md`](AGENTS.md) is not optional.
5. **Bump the version** if it is a release-worthy change. All three manifests
   (`package.json`, `viewer/package.json`, `deployment/win/package.json`) must
   agree — `npm run check` fails if they drift.

## Things that will bite you

These are hard-won; please read [`docs/architecture.md`](docs/architecture.md)
before changing the render path.

- **One React instance.** Canvas bundles must keep `react`, `react-dom` and the
  UI libraries `external` so they share the host process's copies. A second copy
  means "Invalid hook call". The `.exe` build additionally needs
  `format: "cjs"`.
- **`asar: false` is mandatory** for the viewer. esbuild runs as a separate
  process and cannot read inside `app.asar`.
- **Declare peer dependencies explicitly.** npm auto-installs peers in
  development, but electron-builder prunes them. `@mantine/hooks` is one.
- **Output must be self-contained.** Inline all CSS; no CDN `<link>`s.
- **Never commit generated files** or secrets. `.env` stays local.

## Verifying packaged builds

Dev-mode tests cannot catch packaging failures. After changing anything that
affects packaging, rebuild and self-check the artifact:

```bash
npm run build:release
release\tsx-reader-export-viewer\tsx-reader-export-viewer.exe --smoke testcases\example.canvas.tsx
node scripts\measure-startup.mjs        # should stay well under a second
```

## Pull requests

- Keep them focused; one concern per PR.
- Describe what you changed and how you verified it.
- Reference the issue if there is one.

## Code of conduct

Be respectful. Harassment or hostile behaviour is not tolerated in any project
space.

## License

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
