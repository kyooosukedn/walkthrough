#!/usr/bin/env node

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { exec } from "node:child_process";

import { scan, writeCodeMap } from "@codemap/scanner";

const args = process.argv.slice(2);

// ─── Parse args ──────────────────────────────────────────────
const flags: Record<string, string | boolean> = {};
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") {
    flags.json = true;
  } else if (args[i] === "--no-serve") {
    flags.noServe = true;
  } else if (args[i] === "--output" && args[i + 1]) {
    flags.output = args[++i];
  } else if (args[i] === "--port" && args[i + 1]) {
    flags.port = args[++i];
  } else if (args[i] === "--help" || args[i] === "-h") {
    printHelp();
    process.exit(0);
  } else if (!args[i].startsWith("-")) {
    positional.push(args[i]);
  }
}

const targetPath = resolve(positional[0] || ".");

if (!existsSync(targetPath)) {
  console.error(`✗ Path not found: ${targetPath}`);
  process.exit(1);
}

// ─── Run ─────────────────────────────────────────────────────
main().catch((err) => {
  console.error("✗ Scan failed:", err.message);
  process.exit(1);
});

async function main() {
  console.log(`◆ CodeMap — scanning ${targetPath}`);

  // Scan
  const codemap = await scan(targetPath);
  console.log(
    `  ${codemap.meta.stats.files} files, ${codemap.meta.stats.directories} directories`,
  );

  if (codemap.meta.frameworks.length > 0) {
    console.log(
      `  Frameworks: ${codemap.meta.frameworks.map((f: { name: string }) => f.name).join(", ")}`,
    );
  }

  // --json: output to stdout
  if (flags.json) {
    process.stdout.write(JSON.stringify(codemap, null, 2));
    return;
  }

  // Write JSON
  const outputPath = flags.output
    ? resolve(flags.output as string)
    : join(targetPath, "codemap.json");

  await writeCodeMap(codemap, outputPath);
  console.log(`  Written: ${outputPath}`);

  if (flags.noServe) return;

  // Serve
  const port = parseInt(String(flags.port || "3000"), 10);
  await serve(codemap, port);
}

// ─── HTTP server ─────────────────────────────────────────────
async function serve(codemap: unknown, port: number) {
  const codemapJson = JSON.stringify(codemap, null, 2);

  // Look for visualizer dist
  const visualizerDir = resolve(
    import.meta.dirname ?? ".",
    "../../visualizer/dist",
  );

  const hasVisualizer = existsSync(join(visualizerDir, "index.html"));

  const server = createServer(async (req, res) => {
    if (req.url === "/codemap.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(codemapJson);
      return;
    }

    if (!hasVisualizer) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body style="background:#0A0A0F;color:#E8E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><pre>${codemapJson}</pre></body></html>`);
      return;
    }

    // Serve visualizer static files
    let filePath = join(visualizerDir, req.url === "/" ? "index.html" : req.url!);
    if (!existsSync(filePath) || (await stat(filePath)).isDirectory()) {
      filePath = join(visualizerDir, "index.html");
    }

    try {
      const content = await readFile(filePath);
      const ext = filePath.split(".").pop();
      const types: Record<string, string> = {
        html: "text/html",
        js: "application/javascript",
        css: "text/css",
        json: "application/json",
        svg: "image/svg+xml",
        png: "image/png",
        ico: "image/x-icon",
      };
      res.writeHead(200, { "Content-Type": types[ext ?? ""] ?? "application/octet-stream" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`  ◆ Open: ${url}`);
    open(url);
  }).on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`  ✗ Port ${port} is in use. Try --port ${port + 1}`);
    } else {
      console.error(`  ✗ Server error: ${err.message}`);
    }
    process.exit(1);
  });
}

// ─── Open browser ────────────────────────────────────────────
function open(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`, (err) => {
    if (err) console.log(`  Open your browser: ${url}`);
  });
}

// ─── Help ────────────────────────────────────────────────────
function printHelp() {
  console.log(`
◆ CodeMap — understand any codebase in 5 minutes

Usage:
  codemap [path]        Scan a project and open visualizer
  codemap .             Scan current directory

Options:
  --json                Output codemap.json to stdout
  --output <path>       Write JSON to custom path
  --port <number>       Dev server port (default: 3000)
  --no-serve            Write JSON and exit
  -h, --help            Show this help

Examples:
  npx codemap ./my-project
  npx codemap ./my-project --json > map.json
  npx codemap ./my-project --port 8080
`);
}
