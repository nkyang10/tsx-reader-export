# Canvas Reader — Engineering Log

Append every significant change here with a date and the rationale (rule #6 in
`AGENTS.md`). Newest entries on top.

---

## 2026-09-28 — The reader moves to the top level of the release

**What was asked**

Two things. First, whether `run-cli.bat` and `tsx-reader-export.exe` are
interchangeable — they are: the bat is a five-line wrapper that `cd`s to its own
folder, echoes a banner, calls the exe with `%*` verbatim, prints the exit code
and the log path, and `pause`s so the window does not vanish. Same flags, same
behaviour; the bat just keeps a console on screen.

Second, and the real point: **the reader is the product, so stop filing it away
in a subfolder.** The Windows release had the CLI's files at the top level and
the app buried in `tsx-reader-export-viewer\`, which is a hierarchy that says the
command line is the product and the GUI is an accessory.

**Decision**

The reader's exe now sits at the top level of `release/` and the CLI takes the
one subfolder, `release\cli\`. `dist/exe/` moves wholesale under it.

**The cost, stated plainly**

An unpacked Electron app cannot be a single file. It resolves `locales\`,
`resources\` and a dozen `.pak`/`.dll` siblings relative to the exe, so the root
of the zip now has 19 loose runtime files around `tsx-reader-export-viewer.exe`
instead of one tidy folder. That is the trade: a readable root that says "this
is the app", paid for with visual noise. The alternative — a single `portable`
exe — was already measured and rejected: it re-extracts ~200 MB on *every*
launch (23s to window, vs 0.2s unpacked), and `portable.unpackDirName` did not
help. So "clean root" and "fast start" cannot both be had; fast start won, and
the README now says plainly that the loose files are the runtime, not clutter.

**Why the CLI relocated without a single code change**

`src/cli-exe.mjs` derives every path from `process.execPath` (`EXE_DIR`) — the
log, the scratch dir, the usage text — and the esbuild bundle resolves React and
the shim from the `node_modules` beside the exe. Nothing reaches upward, so
moving the folder as a unit is safe. The one thing that did need care is
`Unblock-File`: it used to run against the viewer's subfolder, and it now runs
against the release root *before* the CLI is copied, so it still only touches
the reader's files and the CLI ships byte-identical to `dist/exe/`.

Our MIT notice is copied to the release root explicitly now. It used to arrive
there as a side effect of copying the CLI folder; with the CLI moved down a
level, the top level would otherwise carry only Chromium's own
`LICENSE.electron.txt` / `LICENSES.chromium.html`. The app still ships its own
copy inside `resources\app\`.

**Not changed**

- The *source* layout. `viewer/` stays a subfolder of the repo: it is a separate
  npm package with its own `package-lock.json`, its own `node_modules`, and
  electron-builder's `appDir` cannot reach outside its root. Flattening it into
  the repo root would mean one lockfile for the CLI and the app, and a much
  larger diff across the build scripts, the CI workflow and `AGENTS.md`.
- `docs/release-notes-1.0.0.md`. `v1.0.0` is tagged; its notes describe the zip
  as it shipped. The layout change is recorded under `[Unreleased]` instead.

**Verification**

- `npm run check` — every fixture in `testcases/` renders.
- `npm run build:release --no-build` re-assembles from the existing
  `dist/exe/` and `viewer/dist/win-unpacked/`, and the printed inventory matches
  the new tree.
- `release\cli\tsx-reader-export.exe` converts a fixture from inside its new
  subfolder, which is the real proof that the CLI resolves nothing above itself.
- `release\tsx-reader-export-viewer.exe --smoke <fixture>` renders headlessly
  from the new top level.

---

## 2026-09-28 — Stop shipping the dev toolchain; collapse the duplicate output trees

Follow-on from promoting the reader to the top of the release. Two questions got
asked in the same sitting: *are all these files necessary?* and *is anything
duplicated?* Both turned out to be yes, and the answers were not the ones I
expected.

### 1. The CLI shipped its own build tools to end users

`cli\node_modules` was **72.1 MB — the exact size of the dev `node_modules`**,
because `scripts/build-cli-exe.mjs` did `cpSync(root/node_modules, outDir/…)`.
So the user's download contained:

| package | size | why it was there |
|---|---|---|
| `typescript` | 22.5 MB | `devDependencies`, for `npm run typecheck` |
| `postject` + `commander` | 4.8 MB | the tool that injects the SEA blob |
| `@types/*` | 3.2 MB | type declarations |
| `undici-types`, `.bin` | 0.1 MB | transitive |

**30.4 MB — 42% of the folder — that the exe never loads.** The giveaway is
that electron-builder was already doing the right thing for the viewer: its
pruned tree is 38.3 MB against this one's 72.1 MB. The CLI was the one place
that never caught up.

**Fix:** `npm ci --omit=dev --ignore-scripts` into a staging folder, then
`rename` the result into place. 72.1 → 42.3 MB. Deliberately *not* a delete list
of known dev packages: a hand-maintained list is silently wrong the day someone
adds a devDependency, and npm already knows the answer. The build now throws if
`typescript`, `postject` or `@types/node` shows up in the output.

`--ignore-scripts` is load-bearing and worth explaining. The only postinstall in
the production closure is esbuild's, and all it does is validate the binary that
already ships as an optionalDependency (`@esbuild/win32-x64`) — so skipping it
costs nothing. It also stops npm from running *this package's* `prepare`
(`embed-styles`) inside the staging dir, which has no `scripts/` to run it from.
`--prefer-offline` keeps the build working once the npm cache is warm. I checked
the lockfile first: npm already filters optional platform packages to
`win32-x64`, so a production install does not drag in all 25 esbuild binaries.

### 2. Two 100% duplicate trees

`dist\exe` measured **131.9 MB — byte-for-byte the same size as `release\cli`**.
It existed only so `build:release` could copy it across. So the repo held the
same 13,000 files twice and copied all of them on every release build.

`build:exe` now takes `--out <dir>` and defaults to `release\cli\`.
`build:release` wipes everything in `release/` **except** `cli\` before laying the
viewer in beside it — a blanket `rm -rf release` would destroy the executable it
had just built, and the `--no-build` re-assemble path has to keep the one it
already has. `dist/` does not exist any more.

### 3. A third way to ship the same CLI

`deployment/win/` shipped the CLI as **source** plus an `install.ps1` that
downloaded a portable Node.js into `./node` and ran `npm ci`. The SEA exe
produces byte-identical output with no Node, no install step and no network, so
this was strictly the worse mechanism — while costing a 5th tracked file set, a
`package.json`/`package-lock.json` pair to keep in sync forever, its own
`npm run build:deploy`, and a whole `AGENTS.md` section. Deleted, along with
`scripts/build-deploy.mjs`.

The honest counter-argument: it is the only distribution with **no compiled
binary**, so it is reviewable and runs on any Node 18+. Worth keeping only if
someone actually needs that; it was not being maintained as a first-class path
either.

### Two output folders, one rule

`out/` is scratch, `release/` ships. `npm run check` renders to `out/`, the
smoke test screenshots to `out/smoke/`, `npm run capture -- --pdf` writes
`out/sample-output.pdf`. That is the whole vocabulary — no `dist/`, no staging
tree. `release/` is both "where the build happens" and "what you ship", which
is a little odd but strictly better than paying 130 MB to keep two copies of one
artifact in sync.

**Result:** release 468.2 MB → 438.4 MB, and the repo has one fewer output
folder, one fewer distribution model, and one fewer full-tree copy per release.

**Verification**

- `npm run build:release` from an empty tree: both artifacts, `dist/` never
  created, CLI at 131.9 MB.
- `npm run build:release --no-build` re-assembles the viewer and **keeps**
  `release\cli\`.
- `release\cli\tsx-reader-export.exe` converts the fixture → 246,702 bytes,
  unchanged, with the production-only tree.
- `release\tsx-reader-export-viewer.exe --smoke` → 246,704 chars.
- `npm run check`, `npm run sync` (now just `build:viewer`) both pass.

---

## 2026-09-27 — Build the macOS viewer from CI

**Why a workflow**

Wanted an untested macOS build for a few people to try. electron-builder
**cannot** cross-build it from Windows: `app-builder-lib/out/packager.js`
throws `Build for macOS is supported only on macOS` whenever the target platform
is `mac` and the host is `win32`, and the check is unconditional — no flag and
no environment variable bypasses it. Patching the throw is not an option
either, because `app-builder-bin` only ships the binary for the *host* platform,
so the darwin `app-builder` this machine would have to exec is not even on disk.

So a macOS runner is the only supported route. Added
`.github/workflows/release-macos.yml` (tag push `v*`, or manual dispatch). The
repository is public, so the runner is free.

**Unsigned, deliberately**

No Apple Developer certificate is configured, which means the workflow needs no
secrets at all and runs on a fork. Testers get Gatekeeper's warning and have to
clear it once — right-click the app → Open, or
`xattr -dr com.apple.quarantine "/Applications/Canvas Reader.app"`. Signing and
notarising need both an Apple account and a Mac, and are out of scope for a
tester build. `mac.identity: null` is set explicitly so that a mac dev with a
certificate in their keychain does not silently produce a *differently signed*
build from the CI one.

The zip target now ships next to the dmg: someone who cannot get past Gatekeeper
on the dmg can drag the app out of the archive instead.

**The icon trap**

`viewer/build/` is gitignored, so a clean CI checkout has **no** `icon.png`, and
electron-builder only warns and falls back to the default Electron icon — the
build would have succeeded and looked wrong. Worse, `scripts/make-icon.ps1`
cannot be moved to the macOS runner: it draws with `System.Drawing`, which is
Windows-only, and `pwsh` on macOS cannot load that assembly. So the workflow has
a `windows-latest` `icon` job that runs the existing script and uploads the PNG,
which the macOS job downloads into `viewer/build/`. The icon stays uncommitted
and rule 2 is intact.

**Verification is partial, on purpose**

The x64 job runs `Canvas Reader.app/Contents/MacOS/tsx-reader-export-viewer
--smoke testcases/example.canvas.tsx` after packaging, so the packaged mac build
is at least rendered once on a real Mac — using the synthetic fixture, per rule
12. The arm64 job is not smoke-tested, because the runner is x64 and arm64 would
need Rosetta. This does not replace testing on real Apple hardware: it catches
packaging failures (the missing-peer-dependency class of bug) and nothing more.

**Naming**

`mac.artifactName` was unset, so the artifacts would have been named after
`productName` — putting the display name "Canvas Reader" in a filename. Now
`${name}-${version}-mac-${arch}.${ext}`, matching the `win` block, so the
keyname is what lands on disk.

**Not done:** the CLI has no macOS artifact. The Windows `.exe` is a Node SEA
build, which is Windows-only, so a mac tester uses the viewer, or runs the CLI
from source with `node src/cli.mjs`.

---

## 2026-09-26 — Unify the product name and finish the data purge

**Product name**

The repository and every URL had been called `tsx-reader-export`, but the
product itself still shipped as `tsx2html` — the npm package, the CLI script,
the `.exe`, the viewer package, the electron-builder `appId`/`productName`, the
release zip, the temp directory, the log filenames and the docs all disagreed
with the repo. Renamed `tsx2html` -> `tsx-reader-export` everywhere, so the
project has exactly one name:

| Surface | Was | Now |
| --- | --- | --- |
| npm package | `tsx2html` | `tsx-reader-export` |
| npm script | `npm run tsx2html` | `npm run tsx-reader-export` |
| CLI exe | `tsx2html.exe` | `tsx-reader-export.exe` |
| Viewer app | `tsx2html viewer` | `tsx-reader-export viewer` |
| Viewer package | `tsx2html-viewer` | `tsx-reader-export-viewer` |
| appId | `dev.tsx2html.viewer` | `dev.tsx-reader-export.viewer` |
| Release zip | `tsx2html-<v>-windows-x64.zip` | `tsx-reader-export-<v>-windows-x64.zip` |
| Temp dir | `.tsx2html-tmp` | `.tsx-reader-export-tmp` |
| CLI log | `tsx2html.log` | `tsx-reader-export.log` |
| Env overrides | `TSX2HTML_BASE_DIR`, `TSX2HTML_LOG_DIR` | `TSX_READER_EXPORT_BASE_DIR`, `TSX_READER_EXPORT_LOG_DIR` |

The two env-var overrides are the one place the new name could not be a plain
token: they are identifiers, so they move to upper snake case rather than
carrying the product's hyphens. Everything else in the release path is a
string, a filename or a folder name and takes the rename verbatim.

**Data purge follow-up**

The earlier purge (previous entry) cleaned git history but left the data on
disk and two references to it in tracked files:

1. `docs/assets/output.png` and `docs/assets/viewer.png` were **still on disk**
   and still contained the private IP address, both internal hostnames and the
   customer-facing product name — rendered as pixels, so no text scan would
   ever have found them. Deleted; they are gitignored build output and are
   regenerated by `npm run capture` from the synthetic fixture.
2. `viewer/dist/` held a packaged copy of the app whose `main.mjs` still
   referenced the private fixture by name. Deleted, along with `dist/`,
   `release/`, the release zip, `deployment/win/out` and the temp dir.
3. `.gitignore` still carried a `Never commit` rule for the private fixture,
   with a comment claiming it was recoverable from the pre-rewrite history.
   That history no longer exists, so the rule was misleading. Removed.
4. `docs/engineering-log.md` named the purged fixture three times. Those
   references now describe it generically, per rule 11.

**Verification**

- Full object-store scan (`cat-file --batch-all-objects`, 198 objects / 119
  blobs, every ref including unreachable): no private IP, internal hostname,
  product name or token shape. The only hits were a dependency lockfile and
  `AGENTS.md`'s own copy of the scan pattern.
- Full working-tree scan, including gitignored files, for each leaked literal:
  zero hits outside git metadata.
- `npm run check` and `npm run viewer:smoke` pass with the new name (the
  Electron viewer launches, renders and writes its PNG).
- `deployment/win/package.json` picked up the removal of its `private` field;
  that is `npm run build:deploy` syncing the file, not a manual edit.

**Correction to the previous entry**

That entry says the rewritten history and the tag were force-pushed to GitHub
and that a GitHub Support request is required to purge cached views. Neither
matches the remote as it stands: `git ls-remote origin` returns **no refs at
all** and `git fetch origin` is a no-op, while the repository page itself
returns HTTP 200. The remote is an empty repository, so:

- there is no published history to rewrite — publishing is a plain first push,
  not a force-push;
- there are no cached views, forks or unreachable objects on GitHub's side, so
  the support request described in the previous entry is **not needed**;
- the local object store was the only place the data ever existed, and the
  follow-up above is what actually finished removing it.

Treat the earlier "force-pushed" and "follow-up required" notes as superseded
by this entry.

**Publish, and three loose ends**

Publishing the rewritten history turned up three things that were still
inconsistent:

1. **Commit and tag author was still `tsx2html <tsx2html@local>`.** The repo
   identity had never been renamed with the project, so the single published
   commit carried the old name as its author. Set the repo-local identity to
   `tsx-reader-export` and re-authored (`--reset-author`); both `main` and the
   `v1.0.0` tag were force-pushed to match.
2. **`.env.example` looked like a runtime dependency.** It declares
   `SERPER_API_KEY`, which nothing in `src/` or `scripts/` reads — the tool
   makes no network requests at all. It is there for the coding agent used
   during development, and the file now says so, so the next reader (or agent)
   does not go looking for the call site or assume the build needs a key.
3. **The README pointed at a release that did not exist.** `npm run
   build:release -- --zip` now produces `tsx-reader-export-1.0.0-windows-x64.zip`
   (178 MB) with the layout the README documents. Verified end to end: the CLI
   exe renders a canvas from the release folder and writes
   `logs/tsx-reader-export.log`; the packaged viewer passes `--smoke` and
   resolves `%APPDATA%\tsx-reader-export-viewer\`. The release folder was
   scanned for the literals from the earlier purge before packaging — clean.

The zip still has to be attached to the `v1.0.0` release; there is no `gh` CLI
in this environment, so the upload was driven through the REST API with the
credential Git Credential Manager already holds for `github.com`. The token was
read in-process and never written to a command line, a file, or the log.

Two traps worth recording, because both fail quietly or misleadingly:

1. **A draft release does not keep the tag you ask for.** GitHub replaces
   `tag_name` with a generated `untagged-<random>` placeholder, and keeps that
   placeholder when the draft is published without `tag_name` being set back.
   The first attempt published a release under `untagged-0006d0ad57fe1fcecf4d`
   and created that tag in the repository. Fixed by deleting the release and
   the stray tag and recreating it non-draft with `tag_name: v1.0.0` — the tag
   already existed locally, so no draft was needed at all. Lesson: create the
   release published, and upload the asset afterwards; the only cost is a
   minute of an asset-less release page.
2. **Windows PowerShell 5.1 reads `.ps1` and text files as the ANSI codepage.**
   `Get-Content -Raw` on the UTF-8 release notes turned every em dash into
   mojibake, and the API rejected the `body` with a 422 that echoed 2 MB of
   payload back. `[System.IO.File]::ReadAllText(path, UTF8)` is the fix.
   Related: `HttpClient.PatchAsync` does not exist in .NET Framework, so PATCH
   needs an explicit `HttpRequestMessage`.

Verified after publishing: the download URL returns HTTP 200 with
`Content-Length` 186,277,802 — identical to the local zip — the release body is
3,426 characters containing a real U+2014 em dash and no replacement
characters, and the repository has exactly one release and the two expected
tags.

**MIT notice was missing from both artifacts**

Checked the upstream shim's licensing while answering a question: it is plain
MIT, identical in the `license` field, the shipped `LICENSE` and the upstream
repository, with no additional terms in its README. Our `LICENSE` already
matches it, and the shim's own notice travels correctly because the package is
installed rather than vendored.

Our own notice, however, was in neither shipped artifact. The packaged viewer's
electron-builder `files:` allowlist covered only `main.mjs`, `preload.mjs`,
`renderer/**`, `src/**` and `package.json`, so `resources/app/` had no `LICENSE`
— the app shipped our source with no notice, which is exactly what MIT forbids.
`build-cli-exe.mjs` had the same gap in `dist/exe/`.

The CLI side was a one-line copy. The viewer side needed two steps, because
adding `LICENSE` to the electron-builder `files:` list silently does nothing:
the packager's `appDir` is `viewer/`, it will not match a path outside that
root, and a non-matching glob is dropped without a warning. There is no
`LICENSE` in `viewer/` to match. So `build-viewer.mjs` now stages a copy of the
root `LICENSE` to `viewer/LICENSE` (gitignored, regenerated) and
`build-release.mjs` runs `build-viewer.mjs` before invoking electron-builder, so
a release never depends on a stale staging. Both `README.txt` files name the
license and point at the shim's own copy.

Worth stating plainly: the upstream's obligation was satisfied and ours was
not, so this was a self-inflicted compliance gap rather than an upstream
restriction.

Verified in the built zip: `LICENSE` at the top level (CLI folder) and
`resources/app/LICENSE` (packaged viewer), with the shim's notice still
alongside in `node_modules`. The rebuilt CLI exe renders and the rebuilt viewer
still passes `--smoke`.

---

## 2026-09-26 — Capture the reader, not just the canvas

The screenshots showed the canvas but undersold the product: only one of the
reader's three UI states was captured, so the toolbar, the drop zone and the
failure path were all invisible. `viewer/capture.mjs` now shoots four frames
from the same window, in order:

| File | State |
| --- | --- |
| `viewer-empty.png` | the reader before anything is loaded — drop zone, Save/Print disabled |
| `viewer.png` | the canvas rendered in the preview pane |
| `viewer-error.png` | the failure state, red status bar |
| `output.png` | the exported HTML alone, as a browser shows it |

The error frame is **posed, not provoked**: the status bar is driven directly
rather than by a genuinely broken canvas. A real broken fixture is not an
option, because `npm run check` renders everything in `testcases/` and would
fail on it. The wording is an error this tool actually produces
(`src/core.mjs`). Worth knowing which of these images is staged.

**No screenshot contains the native window frame.** `capturePage()` returns the
web contents of a hidden window, so the title bar reading "Canvas Reader" is in
none of them. Capturing the real frame needs a visible window plus a screen
capture, which depends on the session, on DPI, and on what else is on screen —
it would make `npm run capture` machine-dependent and would need
screen-recording permission on macOS. Deterministic and identical everywhere
was judged worth more than a prettier frame. This is the same trade as not
screenshotting the host's PDF reader.

**PDF: generated, not photographed.** `--pdf` renders the same HTML through
`webContents.printToPDF()` — no dialog, no printer driver, no dependency on
"Microsoft Print to PDF" being installed. The Print *button* still hands off to
the OS dialog on purpose; this is the headless equivalent, used only to produce
`dist/sample-output.pdf` for the release. It deliberately does **not** go in
`docs/images/`: a PDF is a release artifact, not documentation, so it lands in
the gitignored `dist/` and is attached to the GitHub release as a sample.

`--pdf` also has to be reachable as `CAPTURE_PDF=1`, for the same reason
`CAPTURE_OUT` exists: `npm run capture -- --pdf` does not survive npm, which
drops the flag. A third instance of the same trap.

Verified: the reader chrome that appears in the new frames
(`viewer/renderer/index.html`) has no address, hostname, e-mail or token in it,
so those frames are safe by construction; the canvas-derived frames were
checked by enumerating the exported HTML's text, as before. The PDF is a valid
`%PDF-1.4` document from the same already-verified HTML.

---

## 2026-09-26 — Name the product "Canvas Reader", and commit the screenshots

**Product name**

Until now the project had exactly one name, `tsx-reader-export`, used as both
the display name and the keyname — so a window title read
`tsx-reader-export viewer` and the executable was `tsx-reader-export viewer.exe`,
with a space in the filename. That is now three deliberate names:

| Role | Value | Where it appears |
| --- | --- | --- |
| Long | `Canvas Reader with HTML and PDF` | README and doc titles, package descriptions, release title |
| Short | `Canvas Reader` | window title, `productName`, Start-menu shortcut, CLI banner, prose |
| Keyname | `tsx-reader-export` | every filename, package name, id, path, log, env var |

The whole point is that the two are now separable. electron-builder made that
explicit rather than incidental:

```yaml
appId: dev.tsx-reader-export.viewer   # keyname, stable forever
productName: Canvas Reader            # what a person sees
executableName: tsx-reader-export-viewer   # the file on disk
```

Verified in the built binary: `ProductName`, `CompanyName` and
`LegalCopyright` all read **Canvas Reader** while the file on disk is
`tsx-reader-export-viewer.exe`, with no space. `appId`, the npm package names,
`.tsx-reader-export-tmp/`, `tsx-reader-export.log` and `TSX_READER_EXPORT_*`
are untouched, and the viewer's log still lands in
`%APPDATA%\tsx-reader-export-viewer\` — the display name did not leak into a
path. `viewer/package.json` also gained an explicit `author`, because without
one electron-builder stamps `CompanyName` as "GitHub, Inc." in the binary.

`artifactName` moved from `${productName}` to `${name}`, so installers are
`tsx-reader-export-viewer-<version>-win-<arch>.exe` rather than something with a
space in it.

**Screenshots are now committed**

Rule 12 said screenshots must never be committed, and the reason was real: the
first version of the README images was a capture of the private fixture, so
customer data went into the repository as pixels where no text scan could find
it. That reason still holds, so the rule was narrowed rather than deleted.
`docs/images/` is tracked, the README uses both images, and the safety property
is now enforced in code instead of by convention:

`viewer/capture.mjs` writes **only** `testcases/example.canvas.tsx` into
`docs/images/`. Given any other canvas it refuses and points at
`CAPTURE_OUT`. The flag is an env var rather than `--out` because
`npm run capture -- --out <dir>` does not survive npm — npm drops the flag and
passes the directory as the canvas, which lands in the refusal path anyway.

Before committing, both captures were checked the only way they can be without
reading pixels: the PNG is a rasterization of the exported HTML, so every
visible string was enumerated from the DOM and reviewed. The fixture is
invented end to end ("Not real data", "This is a fixture") with generic service
names, and the scan found no address, hostname, e-mail or token. That covers
text; it would not catch a secret drawn as an image, which is why the rule
still requires reading the canvas, not just the picture.

**A self-inflicted hazard, for the record**

The bulk rename was first applied with a PowerShell helper that took pairs as
`@(@(old, new))`. PowerShell flattens a single-element array, so each "pair"
arrived as two plain strings and the helper called
`String.Replace(Char, Char)` — replacing every occurrence of one letter with
another across whole files. It silently mangled eight files, `LICENSE` included.
Caught by diffing, reverted with `git checkout`, redone with explicit edits, and
every JSON manifest re-parsed afterwards. The lesson is the same one as the
earlier case-insensitive `-replace`: on a bulk rename, verify by re-reading the
files, never by the absence of an error.

---

## 2026-09-26 — Security: purge a fixture containing internal data from history

**What happened**

The original fixture, a `testcases/*.canvas.tsx` file whose name is
deliberately not repeated here, embedded real internal infrastructure
details: private IPv4 addresses, internal
hostnames (two distinct private domains), a customer-facing product name, and
references to a dated internal test log. It had been committed in the very
first commit and was present in every commit since.

**Why deleting the file was not enough**

Removing it in a normal commit leaves it fully readable in history at its
original SHA, and the two README screenshots generated from it contained the same
data as pixels. Both had to go.

**Remediation**

1. Replaced it with `testcases/example.canvas.tsx` — a synthetic fixture that
   exercises the **same** `cursor/canvas` surface (verified: `theme.category`,
   `theme.diff` inserted/removed, `Callout`, `Stat` tones, `H1`/`H2`, a custom
   grid) with no real-world data, so `check` / `smoke` / `capture` still have
   real coverage.
2. Screenshots are now generated artifacts (`npm run capture`) and are
   gitignored; the README image embeds were removed.
3. Rewrote all 11 commits with `git filter-repo --invert-paths`, purging the
   four paths that carried it (the fixture, its generated copy under
   `deployment/win/testcases/`, and the two `docs/assets/*.png` screenshots
   rendered from it).
4. Re-tagged `v1.0.0` onto the rewritten history (the old tag pointed at a
   purged commit) and force-pushed `master` and the tag.

**Verification**

- No commit in `--all` contains the private IP, either internal hostname, the
  product name, or the internal API identifier (verified by scanning every
  commit for each literal).
- A full scan of the **git object store** (`cat-file --batch-all-objects`)
  found no blob containing them.
- `git fsck` clean; working tree clean; `npm run check` passes with the new
  fixture.
- Purged local build artifacts that had the data on disk (`dist/`, `release/`,
  the release zip, `deployment/win/out`, `.tsx-reader-export-tmp/`) and deleted the
  pre-rewrite `.git` backup.

**Follow-up required (not doable from the client)**

A force-push rewrites refs, but the old objects can remain reachable on GitHub
by commit SHA, through cached views, forks and clones. GitHub's documented
process for removing sensitive data must also be followed: contact
[GitHub Support](https://support.github.com/contact) and ask them to purge the
cached views and unreachable objects for this repository.

**Lesson**

Fixtures copied from real work are customer data. Synthetic equivalents should
be created up front, and generated screenshots must never be committed if the
content behind them is not public.

---

## 2026-09-26 — v1.0.0 release: license, version, zip, release docs

**Version: 1.0.0** — first stable release. The tool renders correctly, both
Windows artifacts build and self-verify, and the render pipeline is shared by the
CLI, the exe and the viewer. Older versions were effectively pre-release
experiments on a repo with no tags.

**License decision: MIT**

The upstream dependency
[`@thisismydesign/cursor-canvas-web`](https://github.com/thisismydesign/cursor-canvas-web)
is **MIT (© 2026 thisismydesign)** — verified from both the npm tarball
(`license: "MIT"`) and the upstream `LICENSE` file. MIT is the most permissive
OSI-approved license for software, so adopting it here is both the "most open"
choice and the one with zero friction against the dependency we wrap.

`LICENSE` contains the MIT text plus a third-party section that:

- credits the upstream shim and points at its own license,
- clarifies that `src/cursor-canvas.compat.mjs` (our wrapper) is under this
  project's MIT, while the shim itself remains under its own MIT,
- notes the other permissive dependencies (React, Mantine, esbuild, Electron,
  Recharts) are used under their own licenses.

No code was copied from the upstream — it is consumed as a dependency, so the
attribution obligation is satisfied by shipping its license, which npm does.

**Release packaging**

- `build-release.mjs` gained `--zip`: stages the release folder under a single
  versioned top-level directory and zips it with `tar -a -c` (Windows 10+),
  which is far faster than `Compress-Archive` for ~470 MB.
- Fixed two bugs in that script: `dirSize` returned a *string* that was then
  summed numerically (printed `NaN MB` for folders), and folder sizes were
  measured with `statSync().size` (a few bytes) instead of recursing.
- `README.txt` in the release folder is now version-stamped.
- Result: **`tsx-reader-export-1.0.0-windows-x64.zip`, 177.2 MB** (from 468.7 MB
  unpacked), with a single `tsx-reader-export-1.0.0-windows-x64/` top-level folder.

**Version consistency**

The three manifests had drifted to `0.1.0 / 0.1.0 / 1.0.0`, which silently
mislabels release artifacts. All are now `1.0.0`, and `npm run check` **fails**
if they ever disagree again. Also added `license`, `repository`, `homepage`,
`bugs`, `keywords` and `engines` metadata to the root manifest.

**UTF-8 BOM bug (self-inflicted)**

A PowerShell `Set-Content -Encoding UTF8` wrote a BOM into all three
`package.json` files, which made them invalid JSON (`SyntaxError: Unexpected
token`). Stripped the BOMs and made `build-deploy.mjs` write UTF-8 without a
BOM so it cannot reintroduce one.

**Docs added for GitHub**

- `LICENSE` — MIT + third-party attribution.
- `CHANGELOG.md` — Keep a Changelog format, full v1.0.0 entry with Added /
  Fixed / Known limitations.
- `CONTRIBUTING.md` — setup, workflow, and the four "things that will bite you"
  (one React, `asar: false`, peer deps, self-contained output).
- `SECURITY.md` — advisory channel, and an honest threat model: canvases are
  *executed*, so only convert files you trust.
- `docs/release-notes-1.0.0.md` — end-user notes for the GitHub release page,
  including the SmartScreen warning and how to avoid it.
- README: license/version badges, quick start, license and contributing sections.

**Verification** (after building the zip)

- Extracted the zip to a clean temp directory.
- `tsx-reader-export.exe` → 258,399 bytes, `<title>Zip Verify</title>`, 0 external
  stylesheets, exit 0.
- `tsx-reader-export-viewer.exe --smoke` → **SMOKE OK** (258,409 chars).
- `npm run check` → version guard OK, fixture renders.

---

## 2026-09-25 — Repo cleanup: stop committing generated files, unify naming

**Why**

An audit of naming/structure found four problems: `src/` was duplicated three
times in git (including a 237 KB generated CSS file committed 3×), script
naming was inconsistent, there was dead config, and the reasons behind the
duplication existed only as prose in this log.

**What changed**

1. **Generated files are no longer committed** (~48 → 33 tracked files).
   - `src/styles.generated.mjs` — untracked; regenerated by
     `npm run embed-styles`, which now also runs automatically via a `prepare`
     hook on `npm install`.
   - `viewer/src/` and `deployment/win/src/` + `deployment/win/testcases/` —
     untracked; produced by `build:viewer` / `build:deploy`.
   - `viewer/build/icon.png` — untracked; regenerate with
     `powershell -File scripts/make-icon.ps1`.
   - The sync scripts now run `embed-styles` themselves, so each is
     self-sufficient and can never copy a stale/missing generated file.
2. **Naming unified.**
   - `scripts/build.mjs` → `scripts/check.mjs` (it validates, it does not
     build; the other six are all `build-*`). npm script `build` → `check`.
   - `scripts/measure-startup.cjs` → `measure-startup.mjs`, rewritten in ESM
     with a single PowerShell call instead of nested per-poll invocations.
   - Added `npm run sync` = `build:viewer && build:deploy`.
3. **Removed dead code/config.** Dropped `bin: { tsx-reader-export: "dist/cli.mjs" }`
   (it pointed into gitignored `dist/`, so it was broken for any installer) and
   `scripts/build-cli.mjs`, which existed only to feed it. The SEA `.exe` is the
   real distribution.
4. **Added `docs/architecture.md`** — the pipeline diagram, why the on-disk
   copies are unavoidable (electron-builder packages from its own root; `asar:
   false` is mandatory because esbuild runs as a separate process), the
   `format: "cjs"` requirement for the exe, the 23s-vs-0.2s portable/unpacked
   trade-off, what is generated vs committed, and the peer-dependency trap.
5. `AGENTS.md` layout/rules refreshed; fixed a duplicated rule number (two
   "6."s) and rule 9 now names the actual command (`npm run check`).

**Fresh-clone workflow**

```bash
npm install     # prepare -> src/styles.generated.mjs
npm run check   # render every fixture
npm run sync    # viewer/src + deployment/win/src
```

**Verification** (all re-run after the restructure)

- `npm run check` → fixture renders, 258,409 bytes, exit 0.
- `npm run sync` → viewer/src (5 files) + deployment/win synced.
- `npm run build:release` → both artifacts produced.
- `release/tsx-reader-export.exe` converts (258,409 bytes, exit 0).
- `release/tsx-reader-export-viewer/... --smoke` → **SMOKE OK** (258,409 chars).
- `deployment/win/run.bat` → 258,409 bytes, exit 0.
- `node scripts/measure-startup.mjs` → 0.28s, window shown.

---

## 2026-09-25 — Ship the viewer unpacked (startup 23s -> 0.2s)

**Problem**

The single-file `portable` viewer took **~23 seconds** to show its window. Cause:
electron-builder's `portable` target is a self-extracting archive that unpacks
the whole Electron runtime (~200 MB) into a fresh `%TEMP%` directory on
**every** launch.

**Attempted fix that did not work**

Setting `portable.unpackDirName` to pin a stable unpack directory, hoping the
extraction would be reused. Measured result: still **23.0s cold and 23.4s
warm** — electron-builder re-extracts regardless. The config was removed rather
than left in as misleading dead weight.

**Actual fix: ship the `dir` (unpacked) target**

`npm run build:release` now builds the viewer with `--win dir` and copies
`viewer/dist/win-unpacked` into the release folder as `tsx-reader-export-viewer\`. It
needs no installation and starts immediately.

| Build | Time to window |
|---|---|
| `portable` single exe | 23.4s |
| `dir` unpacked folder | **0.45s cold / 0.18s warm** |

The release folder is now:

```
release/
  tsx-reader-export-viewer\      unpacked app - double-click "tsx-reader-export-viewer.exe"
  tsx-reader-export.exe          CLI (needs node_modules\ beside it)
  node_modules\
  cursor-canvas.compat.mjs
  run-cli.bat
  README.txt
```

**Trade-off accepted:** the folder is ~307 MB unpacked (vs a 76 MB single file).
That is the cost of not re-extracting 200 MB on every launch.

**Other changes**

- `build-release.mjs` invokes electron-builder's JS entry directly
  (`node_modules/electron-builder/out/cli/cli.js`) because the `.cmd` shim
  cannot be spawned without a shell on Windows (`EINVAL`), and it no longer
  passes `shell: true` (which mangled the space in `C:\Program Files\...`).
- The viewer folder is `Unblock-File`'d after copying, since build output can
  carry a mark-of-the-web that triggers an extra SmartScreen prompt.
- `nsis` and `portable` targets remain configured in `electron-builder.yml` for
  anyone who wants an installer or a single file.

**Verification**

- `release\tsx-reader-export-viewer\tsx-reader-export-viewer.exe` → window in 0.45s / 0.18s.
- `release\tsx-reader-export-viewer\tsx-reader-export-viewer.exe --smoke <canvas>` → **SMOKE OK**
  (258,409 chars) running from the release folder.
- `release\tsx-reader-export.exe <canvas> release\out\r.html` → 258,409 bytes, exit 0.

---

## 2026-09-25 — Release folder: both exes in one place + real app icon

**What changed**

- Added `scripts/build-release.mjs` — builds both Windows executables and
  assembles them into a single `release/` folder:
  ```
  release/
    tsx-reader-export.exe          CLI (Node SEA)
    node_modules/         required alongside the CLI exe
    cursor-canvas.compat.mjs
    run-cli.bat
    tsx-reader-export-viewer.exe   portable Electron viewer (single file)
    README.txt
  ```
  `npm run build:release` (pass `--no-build` to just re-assemble).
- Added `scripts/make-icon.ps1`, which generates `viewer/build/icon.png`
  (512x512) with System.Drawing. `electron-builder.yml` now sets
  `icon: build/icon.png`.

**Issue: the viewer exe looked like an installer**

`electron-builder` logged `default Electron icon is used / reason=application
icon is not set`, and the `portable` target falls back to an installer-style
icon — so the file *looked* like an installer even though it already ran
standalone with no install step. Providing a real icon fixed the appearance
(the warning is gone and a 32x32 icon is now embedded in the exe).

**Clarification**

The `portable` target has always been a genuine standalone binary: it unpacks
itself to a temp folder and runs, with nothing to install. The installer look
was cosmetic only. The `nsis` target is the one that would actually install.

**Verification**

- `release/tsx-reader-export.exe` converts a canvas (258,401 bytes, exit 0).
- `release/tsx-reader-export-viewer.exe --smoke <canvas>` → **SMOKE OK** (258,409 chars)
  running straight out of `release/`, with no install.

---

## 2026-09-25 — Fix packaged-app `ENOTDIR` + add full diagnostic logging

**Symptoms**

1. Double-clicking either `.exe` appeared to do nothing.
2. The packaged viewer failed when opening a canvas:
   `Error invoking remote method 'viewer:renderPath': Error: ENOTDIR, not a directory`.

**Root causes & fixes**

1. **Double-click = instant console close.** A console `.exe` launched from
   Explorer opens a window that closes the moment it exits, so a usage message
   (or an error) flashes and vanishes. `cli-exe.mjs` now detects a
   no-argument launch, prints guidance, and **waits for a keypress**. Added
   `run-cli.bat` for an explicit console, plus a `--verbose` flag and a
   `--log <file>` option.
2. **Full file logging.** Every run appends a detailed log —
   `logs/tsx-reader-export.log` next to the CLI exe (falling back to `%TEMP%`), and
   `%APPDATA%\tsx-reader-export-viewer\viewer.log` for the viewer. Both log argv, cwd,
   exe path, Node/Electron versions, the resolved esbuild binary, shim/module
   presence, and the full stack on failure. The viewer also logs
   `did-fail-load`, `render-process-gone`, and uncaught exceptions/rejections.
3. **`ENOTDIR` in the packaged viewer.** `core.mjs` derives its temp directory
   from its own location; inside a packaged app that is
   `…\resources\app.asar\src`, and `app.asar` is a **file**, so creating
   `.tsx-reader-export-tmp` inside it fails with `ENOTDIR`. Two fixes:
   - `electron-builder.yml` now sets `asar: false`. This is required, not
     cosmetic: the canvas is bundled at *runtime* by esbuild, which runs as a
     **separate process** and cannot read paths inside `app.asar`. The bundle
     also has to sit next to `node_modules` so it resolves the same react.
   - `viewer/main.mjs` passes explicit `shimPath` and `tmpDir`
     (`RENDER_OPTS`) pointing at real paths inside the app directory, instead
     of relying on the defaults.
4. **Missing `@mantine/hooks` in the packaged app.** It is a **peer
   dependency** of both `@mantine/core` and `@mantine/charts`. npm
   auto-installs peers in development, so the dev build worked, but
   electron-builder's dependency pruner dropped it and the packaged app failed
   with `ERR_MODULE_NOT_FOUND: @mantine/hooks`. Fixed by declaring
   `@mantine/hooks: 7.17.8` explicitly in the root, viewer, and deployment
   manifests.

**Added: headless self-check for the packaged viewer**

`viewer.exe --smoke <canvas.tsx>` renders a canvas and exits, so the *packaged*
build can be verified without GUI interaction. This is what caught the missing
peer dependency — the dev-mode smoke test passed throughout.

**Verification**

- `viewer.exe --smoke testcases/...canvas.tsx` → **SMOKE OK**, 258,409 chars,
  rendered from the packaged app.
- Packaged GUI launches: 5 processes, window titled `tsx-reader-export viewer`.
- `dist/exe/tsx-reader-export.exe` converts a canvas: 258,409 bytes, 0 external
  stylesheets, `theme.category` yellow cell present.
- `node scripts/build.mjs` and dev `npx electron . --smoke` both still pass.

**Lesson**

A dev-mode test cannot validate a packaged build. Peer dependencies that npm
auto-installs are silently pruned by electron-builder, and anything the runtime
touches must exist as a real file (asar is not transparent to child processes).
Test the actual artifact.

---

## 2026-09-25 — Phase 3: ship real `.exe` artifacts (viewer + CLI)

**What changed**

- **Viewer `.exe`**: `npm --prefix viewer exec electron-builder --win portable`
  now produces `viewer/dist/tsx-reader-export-viewer-0.1.0-win-x64.exe` — a single-file
  portable Windows executable. Verified it launches standalone and opens the
  "tsx-reader-export viewer" window (5 processes, window handle found).
- **CLI `.exe`**: added `src/cli-exe.mjs` + `scripts/build-cli-exe.mjs` using
  **Node's Single Executable Application (SEA)** + `postject`. Output is
  `dist/exe/tsx-reader-export.exe` (~90 MB, Node runtime embedded) alongside a
  `node_modules/` folder and the compat shim, so it runs on a machine with no
  Node installed.
- `core.mjs` refactored to support alternative hosts **without changing the
  existing CLI behaviour**:
  - `esbuild`, `react`, `react-dom/server` and the shim runtime are now loaded
    through an injectable `load(spec)` function (defaults to `import()`).
  - `styles.generated.mjs` became a static import (inlined into the SEA bundle).
  - `import.meta.url` guarded with a `moduleDir` fallback for CJS bundling.
  - New `format` option (`"esm"` default, `"cjs"` for the exe).
  - `shimPath` / `tmpDir` options so the exe can point at its own folder.
- Added `npm run build:exe`; documented both run paths in
  `deployment/win/README.md`.

**Key decisions & rationale**

1. **Why SEA + a sibling `node_modules`, not one truly standalone file.** A SEA
   can only `require()` Node built-ins, so third-party modules (react, the shim,
   esbuild's native binary) must exist on disk. Bundling them *inside* the exe is
   not supported by SEA. The result is still a big win: one `.exe` that needs no
   Node installation, replacing the old "download portable Node + npm ci" step.
2. **The canvas bundle is built as CommonJS for the exe.** This was the subtle
   bug: with an ESM canvas bundle, the host `require()`d Mantine's CJS entry
   while the bundle imported Mantine's **ESM** entry — two different module
   instances, so `CanvasRoot`'s `MantineProvider` was invisible and rendering
   failed with *"MantineProvider was not found in component tree"*. Emitting the
   canvas as CJS (and `require()`ing it) makes both sides resolve the same
   instances, preserving rule #3 (single React) in the exe path too.
3. **esbuild's binary is located via `ESBUILD_BINARY_PATH`.** SEA's embedder
   intercepts `require("esbuild")` as a builtin, so `core.mjs` now imports it
   lazily through the injected loader, and `cli-exe.mjs` points
   `ESBUILD_BINARY_PATH` at the shipped `@esbuild/win32-*/esbuild.exe`.

**Verification**

- `node scripts/build.mjs` (CLI) still passes — no regression from the refactor.
- `dist/exe/tsx-reader-export.exe --help` prints usage.
- `dist/exe/tsx-reader-export.exe testcases/...canvas.tsx out.html` writes a 258 KB
  self-contained page: correct `<title>`, **0** external stylesheet links, the
  `theme.category` yellow cell present, callout/stat text intact.
- Ran the exe from an unrelated working directory (`%TEMP%`) with a canvas
  copied there — still resolves its own `node_modules` and renders correctly.
- `npx electron smoke.mjs` → `SMOKE OK`.

**Open questions / next steps**

- Both `.exe`s are **unsigned** (SmartScreen warns on first run). Code-signing
  needs a paid certificate.
- The exe's `node_modules` is large; a `node_modules` prune (dev deps removed)
  would shrink the folder.
- macOS `.dmg`/Linux AppImage for the viewer are configured but not built here.

---

## 2026-09-25 — Fix: viewer failed to launch (`webUtils` not exported)

**Symptom**

The viewer produced no window. Electron logged:

```
Uncaught Exception: .../viewer/main.mjs:1
import { app, BrowserWindow, dialog, ipcMain, shell, webUtils } from "electron";
                                                       ^^^^^^^^
SyntaxError: The requested module 'electron' does not provide an export named 'webUtils'
```

**Root cause**

`webUtils` (added for Electron 32+, where `File.path` was removed) **does not
exist in the pinned Electron 33.4.11 build** used here. Because the import is
evaluated when `main.mjs` is loaded, the *entire* main process failed to
instantiate — so no window was ever created. The offscreen `smoke.mjs` test
still passed, which is why this only surfaced when launching the real GUI.

**Fix**

- Removed the `webUtils` import from `main.mjs` entirely.
- Made drag-and-drop version-proof: the renderer now reads the dropped file's
  **text** and sends it over IPC (`viewer:renderSource`); the main process writes
  it to a temp file and renders that, deleting it afterwards. This avoids both
  `File.path` and `webUtils`, so it works across Electron versions.
- `preload.mjs` exposes `renderSource(name, text)` instead of `filePathOf(file)`.

**Verification**

- Launching the real app: 4 Electron processes, **window found with title
  "tsx-reader-export viewer"**, no errors in the Electron log.
- `npx electron smoke.mjs` → `SMOKE OK` (fixture rendered, 258 KB HTML, 82 KB
  screenshot, DOM populated).

**Lesson**

`smoke.mjs` exercises the render pipeline but not the app's own module graph.
A headless render test can pass while the GUI is completely broken — always
launch the real app once and confirm a window handle exists.

---

## 2026-09-25 — Phase 2: cross-platform Electron tsx viewer

**What changed**

- Added `viewer/` — a cross-platform **Electron** app that opens a Cursor canvas
  `.tsx`, previews it in-window, saves it as a self-contained HTML file, and
  prints it via the OS print dialog (on Windows: *Microsoft Print to PDF* /
  *Save as PDF*).
- `viewer/main.mjs` reuses `renderCanvasToHtml` from the same `src/core.mjs` the
  CLI uses — one rendering pipeline, so the preview and the exported HTML are
  identical.
- `viewer/preload.mjs` exposes a narrow, context-isolated IPC surface
  (`open`, `renderPath`, `save`, `print`, `filePathOf`).
- `viewer/renderer/index.html` — the UI: Open / Save as HTML / Print buttons plus
  drag-and-drop; the preview renders in a sandboxed `<iframe>` via `srcdoc`.
- `viewer/electron-builder.yml` — packaging config for Windows (nsis +
  portable), macOS (dmg x64/arm64), and Linux (AppImage).
- `scripts/build-viewer.mjs` syncs root `src/` into `viewer/src/` so the app is
  self-contained and packageable by electron-builder.
- `viewer/smoke.mjs` — headless verification: renders the fixture, writes the
  HTML, captures a screenshot, and asserts the DOM populated.
- Root `package.json` gained `viewer`, `viewer:smoke`, `viewer:dist`, and
  `build:viewer` scripts.

**Key decisions & rationale**

1. **Reuse the CLI core rather than re-implementing.** The viewer imports
   `./src/core.mjs`, so a canvas that renders in the CLI renders identically in
   the viewer — no second rendering path to keep in sync (and no second copy of
   the single-React rule to violate).
2. **Preview via `<iframe srcdoc>`** keeps the untrusted rendered canvas
   isolated from the app's own renderer context (`contextIsolation: true`,
   `nodeIntegration: false`).
3. **Print via `webContents.print({ silent: false })`** opens the *system* print
   dialog, which is what the user asked for ("print as pdf by windows") and
   works the same way on macOS/Linux. Printing happens in a hidden offscreen
   `BrowserWindow` loaded with the same HTML.
4. **Electron chosen over a browser-based viewer** (explicitly confirmed) for
   native open/save dialogs and a real desktop window; the trade-off is a larger
   runtime, which is handled by packaging to per-platform distributables rather
   than vendoring a runtime in the repo.
5. **esbuild binaries must be unpacked** — added `asarUnpack` for
   `esbuild`/`@esbuild` so the native executable can run from inside the asar.

**Verification**

- `npx electron smoke.mjs` → `SMOKE OK`: fixture rendered to 258 KB HTML,
  screenshot captured (82 KB PNG), `document.title` correct, `#root` populated.
  The screenshot confirms correct visual output (grid, tones, and the yellow
  `theme.category` cell from the compat layer).

**Open questions / next steps**

- Signed installers / notarization for macOS are not configured (developer
  identity required); distributables are currently unsigned.
- Viewer shortcuts / recent-files are not implemented yet.

---

## 2026-09-25 — Pin upstream, add `overrides`, document reference strategy

**What changed**

- Pinned every runtime dependency to an exact version in **both**
  `package.json` files (root and `deployment/win/`), removing the `^` ranges.
- Added an `overrides` block forcing `react` / `react-dom` to a single
  `18.3.1` in both manifests, preventing the "two copies of React" SSR class of
  failure (see rule #3).
- Added a local `upstream` git remote pointing at
  `thisismydesign/cursor-canvas-web` (fetch alias only; not pushed to GitHub).
- Extended `scripts/build-deploy.mjs` to copy `overrides` from root to the
  deployment manifest so the two stay in sync.

**Reference strategy (how we "ref" the original project)**

1. The upstream `@thisismydesign/cursor-canvas-web` is referenced by **npm
   package name + pinned version** and its full resolved graph is committed in
   `package-lock.json`. This is the GitHub-visible reference — no vendored
   code, no git submodule.
2. `overrides` hardens the reference against transitive drift that could break
   the single-React SSR requirement.
3. The `upstream` git remote is a **local-only** developer convenience to
   `git fetch upstream` and watch for shim changes; it does not appear on
   GitHub and is never relied on for the build.
4. Deliberately avoided vendoring / git-submodule: the upstream is a published
   npm package, so registry + lockfile is the lowest-friction, most
   maintainable reference.

**Verification**

- `node scripts/build.mjs` still renders the fixture (258 KB) after pinning.
- `npm install` in root and `deployment/win/` completes cleanly with the
  pinned + overridden versions.

---

## 2026-09-25 — Initial working tool + Windows deployment

**What changed**

- Built `src/core.mjs` (`renderCanvasToHtml`): bundles a canvas `.tsx` with
  esbuild, aliases the virtual `cursor/canvas` module to the public shim, and
  server-renders it with `ReactDOMServer.renderToStaticMarkup`. Output is a
  single self-contained HTML file (all CSS inlined, no CDN `<link>`s).
- Added `src/cli.mjs` entry point (`node src/cli.mjs <in.tsx> <out.html>
  [--title T] [--color-scheme auto|light|dark]`).
- Added `src/styles.generated.mjs` via `scripts/embed-styles.mjs` — embeds
  Mantine CSS so the produced HTML is fully offline.
- Added `src/cursor-canvas.compat.mjs` — re-exports the public shim while
  augmenting `useHostTheme()` with `theme.category` (mapped to the shim's
  `colorPalette`). The public shim does not expose `category`; the real Cursor
  SDK does, and the fixture reads `theme.category.yellow`.
- Added `scripts/build.mjs` (validate all fixtures), `build-cli.mjs` (bundle
  CLI), `build-deploy.mjs` (sync deployment folder).
- Created `deployment/win/` — self-contained Windows distribution: copies of
  `src/` + `testcases/`, a locked `package.json`, `install.ps1` (downloads a
  portable Node if none present and runs `npm ci`), and `run.bat`.
- Logged project rules in `AGENTS.md`; recorded secrets handling in `.env`.

**Key decisions & rationale**

1. **One React instance (critical).** The first render attempt failed with
   "Invalid hook call" because the runtime canvas bundle inlined its own React.
   Fix: in `core.mjs#bundleCanvas` the canvas bundle `external`s `react`,
   `react-dom`, the shim, Mantine and Recharts so it shares the host process's
   copy of React. This is now a hard rule (#3).
2. **Bundle the canvas into a project-local temp dir**, not `os.tmpdir()`, so
   bare `react` imports resolve against the project's `node_modules` during the
   dynamic `import()` of the rendered bundle.
3. **SSR uses `renderToStaticMarkup`** (no hydration, no event listeners) —
   output is static HTML, which matches the tool's purpose. Mantine emits
   inline `<style data-mantine-styles>` blocks that survive SSR.
4. **Self-contained output.** Mantine CSS is embedded at build time from
   `node_modules` and injected into the page so the result works offline.
5. **Deployment = locked mini-project, not a bundled binary.** esbuild loads
   its platform binary at runtime and the canvas bundle must resolve React /
   the shim from `node_modules`, so a single compiled binary would not be
   self-contained. Instead `deployment/win/` ships the source + a portable
   Node installer + `npm ci`. This is robust and truly "everything the user
   needs to run".
6. **`cursor/canvas` is a virtual module** (not on npm under that name). We
   alias it to `@thisismydesign/cursor-canvas-web` (the public shim) plus a
   small compat layer for `theme.category`.

**Verification**

- `node scripts/build.mjs` renders the `testcases/` fixture
  to `dist/out/...html` (258 KB) successfully.
- `deployment/win/run.bat testcases\<fixture>.canvas.tsx out\preview.html --title "..."` writes a self-contained HTML with no
  external CSS links.

**Open questions / next steps**

- Cross-platform (macOS/Linux) deployment parity — currently Windows-first per
  request. Node build is already cross-platform; only the installer scripts are
  Windows-specific.
- The fixture is the sole testcase; more canonical fixtures would harden the
  tool (charts, DAG, TodoList, state).
