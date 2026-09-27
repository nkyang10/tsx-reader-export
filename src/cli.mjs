import { renderCanvasToHtml } from "./core.mjs";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

function printHelp() {
  console.log(`Canvas Reader with HTML and PDF - convert a Cursor canvas .tsx into a standalone HTML file.

Usage:
  tsx-reader-export <input.tsx> [output.html] [--title "My Title"]

Options:
  -o, --output <file>          Output HTML path (default: <input basename>.html)
  --title <text>               <title> of the generated page (default: input basename)
  --color-scheme <auto|light|dark>  Mantine color scheme (default: light)
  -h, --help                   Show this help.

Examples:
  tsx-reader-export my.canvas.tsx
  tsx-reader-export my.canvas.tsx out/page.html --title "My Page"
`);
}

function parseArgs(argv) {
  const args = { input: null, output: null, title: null, colorScheme: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      args.input = args.input === null ? "__help__" : args.input;
    } else if (a === "-o" || a === "--output") {
      args.output = argv[++i];
    } else if (a === "--title") {
      args.title = argv[++i];
    } else if (a.startsWith("--title=")) {
      args.title = a.slice("--title=".length);
    } else if (a === "--color-scheme") {
      args.colorScheme = argv[++i];
    } else if (a.startsWith("--color-scheme=")) {
      args.colorScheme = a.slice("--color-scheme=".length);
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (args.input === null) {
      args.input = a;
    } else if (args.output === null) {
      args.output = a;
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e.message}\n`);
    printHelp();
    process.exit(1);
  }

  if (!args.input || args.input === "__help__") {
    printHelp();
    process.exit(args.input ? 0 : 1);
  }

  const output = args.output
    ? path.resolve(args.output)
    : path.resolve(
        process.cwd(),
        path.basename(args.input).replace(/\.(canvas\.)?tsx?$/i, ".html")
      );

  try {
    const html = await renderCanvasToHtml(args.input, {
      title: args.title,
      colorScheme: args.colorScheme,
    });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html, "utf8");
    console.log(`Wrote ${output} (${Buffer.byteLength(html, "utf8")} bytes)`);
  } catch (e) {
    console.error(`Canvas Reader failed: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
