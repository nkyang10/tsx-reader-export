// Single-file .exe entry point.
//
// Built with Node's Single Executable Application (SEA): the Node runtime is
// copied into tsx-reader-export.exe and this CommonJS bundle is injected into it. A SEA
// can only `require()` Node built-ins, so third-party modules (react,
// react-dom, the cursor/canvas shim, esbuild) are resolved from a `node_modules`
// folder shipped next to the .exe via createRequire().
//
// The canvas bundle esbuild produces at runtime externalises react/react-dom
// (see AGENTS.md rule #3), so writing that bundle into the same folder makes it
// resolve to the exact same react instance this process loaded - one React.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import { renderCanvasToHtml } from "./core.mjs";

const EXE_DIR = path.dirname(process.execPath);
const START = Date.now();

let LOG_FILE = null;
function openLog(explicit) {
  const candidates = explicit
    ? [explicit]
    : [
        path.join(EXE_DIR, "logs", "tsx-reader-export.log"),
        path.join(os.tmpdir(), "tsx-reader-export.log"),
      ];
  for (const file of candidates) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(
        file,
        `\n===== run ${new Date().toISOString()} =====\n`
      );
      LOG_FILE = file;
      break;
    } catch {
      /* try next candidate */
    }
  }
}

let VERBOSE = false;
function log(...args) {
  if (!LOG_FILE) return;
  const line =
    args
      .map((a) =>
        typeof a === "string" ? a : safeStringify(a)
      )
      .join(" ") + "\n";
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* logging must never break the tool */
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function info(msg) {
  log("[info ]", msg);
  if (VERBOSE) console.log(msg);
}

// Keep the console open when launched by double-click so errors are readable.
function pause() {
  if (!process.stdin.isTTY) {
    // No interactive terminal (e.g. piped) - just wait briefly.
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  process.stdout.write("\nPress any key (or Enter) to close this window...");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false);
    process.exit(0);
  });
}

function fail(message, err) {
  const detail = err && err.stack ? err.stack : err ? String(err) : "";
  log("[ERROR]", message);
  if (detail) log(detail);
  console.error(`\n[Canvas Reader] ${message}`);
  if (detail) console.error(detail);
  if (LOG_FILE) console.error(`\nFull log: ${LOG_FILE}`);
  pause();
  process.exitCode = 1;
}

const HELP = `Canvas Reader with HTML and PDF - convert a Cursor canvas .tsx into a standalone HTML file.

Usage:
  tsx-reader-export <input.tsx> [output.html] [options]

Options:
  -o, --output <file>   Output HTML path (default: <input basename>.html)
  --title <text>        <title> of the generated page (default: input basename)
  --color-scheme <s>    Mantine color scheme: light | dark (default: light)
  -v, --verbose         Print progress to the console
  --log <file>          Write the detailed log to this file
  -h, --help            Show this help.

Examples:
  tsx-reader-export my.canvas.tsx
  tsx-reader-export my.canvas.tsx out\\page.html --title "My Page"
  drag-and-drop a .canvas.tsx onto tsx-reader-export.exe
`;

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    title: null,
    colorScheme: null,
    verbose: false,
    log: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-v" || a === "--verbose") args.verbose = true;
    else if (a === "--log") args.log = argv[++i];
    else if (a.startsWith("--log=")) args.log = a.slice(6);
    else if (a === "-o" || a === "--output") args.output = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a.startsWith("--title=")) args.title = a.slice(8);
    else if (a === "--color-scheme") args.colorScheme = argv[++i];
    else if (a.startsWith("--color-scheme=")) args.colorScheme = a.slice(16);
    else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else if (args.input === null) args.input = a;
    else if (args.output === null) args.output = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e.message}\n`);
    console.log(HELP);
    process.exit(1);
  }

  VERBOSE = args.verbose;
  openLog(args.log);

  // Launched by double-click: no arguments, console closes instantly otherwise.
  const noArgs = process.argv.length <= 2;
  if (noArgs) {
    console.log(HELP);
    console.log(
      "\nNo file was given. Drag a .tsx canvas onto tsx-reader-export.exe,\n" +
        "or run:  tsx-reader-export.exe <canvas.tsx> [out.html]"
    );
    info("double-click launch (no arguments)");
    pause();
    return;
  }

  if (args.help) {
    console.log(HELP);
    return;
  }

  log("[argv  ]", safeStringify(process.argv.slice(2)));
  log("[cwd   ]", process.cwd());
  log("[exe   ]", process.execPath);
  log("[node  ]", process.version);
  info(`node ${process.version} | cwd ${process.cwd()}`);

  if (!args.input) {
    console.log(HELP);
    pause();
    return;
  }

  const output = args.output
    ? path.resolve(args.output)
    : path.resolve(
        process.cwd(),
        path.basename(args.input).replace(/\.(canvas\.)?tsx?$/i, ".html")
      );

  const req = createRequire(path.join(EXE_DIR, "noop.cjs"));

  // esbuild's JS API normally finds its native binary via require.resolve, which
  // does not work inside a SEA. Point it at the shipped platform binary.
  const esbuildBin = path.join(
    EXE_DIR,
    "node_modules",
    "@esbuild",
    `${process.platform}-${process.arch}`,
    "esbuild.exe"
  );
  if (fs.existsSync(esbuildBin)) {
    process.env.ESBUILD_BINARY_PATH = esbuildBin;
    info(`esbuild binary: ${esbuildBin}`);
  } else {
    log("[warn ] esbuild binary not found at", esbuildBin);
  }

  const load = (spec) => {
    if (!VERBOSE) log(`[load  ] ${spec}`);
    return Promise.resolve(req(spec));
  };

  const shimPath = path.join(EXE_DIR, "cursor-canvas.compat.mjs");
  if (!fs.existsSync(shimPath)) {
    throw new Error(
      `cursor-canvas shim not found next to the exe: ${shimPath}\n` +
        "Keep tsx-reader-export.exe and its node_modules\\ folder together."
    );
  }

  info(`input  : ${path.resolve(args.input)}`);
  info(`output : ${output}`);

  const html = await renderCanvasToHtml(args.input, {
    title: args.title,
    colorScheme: args.colorScheme,
    load,
    shimPath,
    tmpDir: path.join(EXE_DIR, ".tmp"),
    // CommonJS so the host's require() and the canvas bundle resolve the
    // exact same react / Mantine / shim instances.
    format: "cjs",
  });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html, "utf8");
  const bytes = Buffer.byteLength(html, "utf8");
  info(`rendered ${bytes} bytes in ${Date.now() - START}ms`);
  log("[done  ]", output, bytes);
  console.log(`Wrote ${output} (${bytes} bytes)`);
  if (VERBOSE && LOG_FILE) console.log(`Log: ${LOG_FILE}`);
}

main().catch((e) => fail("failed", e));
