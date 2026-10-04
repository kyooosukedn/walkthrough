#!/usr/bin/env node

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { exec, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

import { scan, writeCodeMap } from "@walkthrough/scanner";
import { readSource, SourceError } from "./source.js";
import { createExplainHandler } from "./explain/handler.js";
import { createDeepSeekProviderFromEnv } from "./explain/provider.js";
import { buildLessonContext, scannedPaths } from "./agent/context.js";
import { createActivityCollector } from "./activity/collector.js";
import { createActivityStore } from "./activity/store.js";
import type { ActivityEventInput } from "./activity/types.js";

const args = process.argv.slice(2);

// ─── Parse args ──────────────────────────────────────────────
const flags: Record<string, string | boolean> = {};
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") {
    flags.json = true;
  } else if (args[i] === "--teach") {
    flags.teach = true;
  } else if (args[i] === "--no-serve") {
    flags.noServe = true;
  } else if (args[i] === "--lesson-context") {
    if (!args[i + 1] || args[i + 1].startsWith("-")) {
      console.error("✗ --lesson-context requires a repo-relative file path.");
      process.exit(1);
    }
    flags.lessonContext = args[++i];
  } else if (args[i] === "--output" && args[i + 1]) {
    flags.output = args[++i];
  } else if (args[i] === "--port" && args[i + 1]) {
    flags.port = args[++i];
  } else if (args[i] === "--host" && args[i + 1]) {
    flags.host = args[++i];
  } else if (args[i] === "--prompt" && args[i + 1]) {
    flags.prompt = args[++i];
  } else if (args[i] === "--help" || args[i] === "-h") {
    printHelp();
    process.exit(0);
  } else if (!args[i].startsWith("-")) {
    positional.push(args[i]);
  }
}

const observing = positional[0] === "observe";
const targetPath = resolve((observing ? positional[1] : positional[0]) || ".");

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
  if (observing && (flags.host !== "claude" && flags.host !== "codex")) throw new Error("observe requires --host claude or --host codex.");
  if (flags.teach && !observing) throw new Error("--teach requires observe.");
  if (observing && flags.host === "codex" && typeof flags.prompt !== "string") throw new Error("Codex observation requires --prompt.");
  if (observing && (flags.json || flags.noServe || flags.lessonContext)) throw new Error("observe needs the local viewer; remove --json, --no-serve, and --lesson-context.");
  if (typeof flags.lessonContext === "string") {
    const codemap = await scan(targetPath);
    const packet = await buildLessonContext(targetPath, flags.lessonContext, codemap);
    process.stdout.write(JSON.stringify(packet, null, 2) + "\n");
    return;
  }
  console.log(`◆ Walkthrough — scanning ${targetPath}`);

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
  await serve(codemap, port, observing ? { host: flags.host as "claude" | "codex", prompt: flags.prompt as string | undefined, teach: flags.teach === true } : undefined);
}

// ─── HTTP server ─────────────────────────────────────────────
async function serve(codemap: Awaited<ReturnType<typeof scan>>, port: number, observe?: { host: "claude" | "codex"; prompt?: string; teach: boolean }) {
  const codemapJson = JSON.stringify(codemap, null, 2);
  const allowedPaths = scannedPaths(codemap.fileTree);
  const token = observe ? randomBytes(32).toString("hex") : undefined;
  const store = observe ? createActivityStore({ maxEvents: 500 }) : undefined;
  const collector = observe && token && store ? createActivityCollector({ repoRoot: targetPath, token, store }) : undefined;
  store?.subscribe((event) => { if (event.path) allowedPaths.add(event.path); });
  const explain = createExplainHandler({
    rootPath: targetPath,
    allowedPaths,
    imports: codemap.imports,
    provider: createDeepSeekProviderFromEnv(),
  });

  // Prefer the visualizer bundled inside this package (published installs);
  // fall back to the monorepo layout for development.
  const bundled = resolve(import.meta.dirname ?? ".", "visualizer");
  const devFallback = resolve(import.meta.dirname ?? ".", "../../visualizer/dist");
  const visualizerDir = existsSync(join(bundled, "index.html")) ? bundled : devFallback;
  const hasVisualizer = existsSync(join(visualizerDir, "index.html"));

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    if (requestUrl.pathname === "/activity/events" || requestUrl.pathname === "/activity/stream") {
      if (collector) collector.handler(req, res);
      else { res.writeHead(404); res.end("Activity is not enabled."); }
      return;
    }
    if (requestUrl.pathname === "/activity/config") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ enabled: !!collector }));
      return;
    }
    if (requestUrl.pathname === "/explain") {
      explain(req, res);
      return;
    }
    if (requestUrl.pathname === "/source") {
      try {
        const content = await readSource(targetPath, requestUrl.searchParams.get("path") ?? "", allowedPaths);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
        res.end(content);
      } catch (error) {
        const status = error instanceof SourceError ? error.status : 500;
        res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
        res.end(error instanceof SourceError ? error.message : "Could not read source.");
      }
      return;
    }
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
      res.writeHead(200, { "Content-Type": types[ext ?? ""] ?? "application/octet-stream", ...(filePath.endsWith("index.html") && collector ? { "Set-Cookie": collector.viewerCookie(), "Cache-Control": "no-store" } : {}) });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`  ◆ Open: ${url}`);
    open(url);
    if (observe && token) void launchObservedHost(observe, port, token).catch((error) => {
      console.error(`  ✗ Agent session failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }).on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`  ✗ Port ${port} is in use. Try --port ${port + 1}`);
    } else {
      console.error(`  ✗ Server error: ${err.message}`);
    }
    process.exit(1);
  });
}

async function launchObservedHost(observe: { host: "claude" | "codex"; prompt?: string; teach: boolean }, port: number, token: string) {
  const url = `http://127.0.0.1:${port}`;
  if (observe.host === "claude") {
    // Claude hooks post directly to the local collector.
    await launchClaudeObserved({ repoRoot: targetPath, url, token, teach: observe.teach });
    return;
  }
  const { runCodexObserved } = await import("./activity/adapters/codex-runner.js");
  const sessionId = randomBytes(16).toString("hex");
  let pending = Promise.resolve();
  const emit = (event: ActivityEventInput) => {
    pending = pending.then(async () => {
      const response = await fetch(`${url}/activity/events`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(event) });
      if (!response.ok) console.error(`  ✗ Activity event rejected (${response.status}).`);
    }).catch((error) => console.error(`  ✗ Activity event delivery failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  console.log("  ◆ Starting one Codex CLI task. Activity stays local.");
  const result = await runCodexObserved({ repoRoot: targetPath, prompt: observe.prompt!, teach: observe.teach, sessionId, emit });
  await pending;
  console.log(`  Codex exited (${result.exitCode ?? "signal"}). Activity remains visible until Walkthrough stops.`);
}

async function launchClaudeObserved({ repoRoot, url, token, teach }: { repoRoot: string; url: string; token: string; teach: boolean }): Promise<void> {
  const packageRoot = resolve(import.meta.dirname ?? ".", "..");
  const pluginRoot = join(packageRoot, "plugin");
  if (!existsSync(join(pluginRoot, ".claude-plugin", "plugin.json")) || !existsSync(join(pluginRoot, "hooks", "hooks.json")) || !existsSync(join(packageRoot, "scripts", "claude-hook.mjs"))) {
    throw new Error("Claude observer files are missing from this CLI install. Reinstall Walkthrough and retry.");
  }
  console.log("  ◆ Starting Claude Code in target repo. Activity stays local.");
  const child = spawn(claudeExecutable(), ["--plugin-dir", pluginRoot], {
    cwd: repoRoot,
    env: { ...process.env, WALKTHROUGH_ACTIVITY_URL: url, WALKTHROUGH_ACTIVITY_TOKEN: token, ...(teach ? { WALKTHROUGH_TEACH: "1" } : { WALKTHROUGH_TEACH: "0" }) },
    stdio: "inherit",
    shell: false,
  });
  await new Promise<void>((resolveChild, rejectChild) => {
    child.once("error", rejectChild);
    child.once("exit", (code) => { console.log(`  Claude exited (${code ?? "signal"}). Activity remains visible until Walkthrough stops.`); resolveChild(); });
  });
}

function claudeExecutable(): string {
  if (process.platform !== "win32") return "claude";
  // npm's Windows shim is a .cmd file. Spawn the native binary it points to,
  // preserving argument boundaries and an interactive console without a shell.
  let candidates: string[] = [];
  try { candidates = execFileSync("where.exe", ["claude"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean); }
  catch { /* The actionable error below covers missing installations. */ }
  for (const candidate of candidates) {
    if (candidate.toLowerCase().endsWith(".exe") && existsSync(candidate)) return candidate;
    if (candidate.toLowerCase().endsWith(".cmd")) {
      const native = resolve(candidate, "..", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
      if (existsSync(native)) return native;
    }
  }
  throw new Error("Claude Code native executable was not found. Install or update Claude Code, then retry.");
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
◆ Walkthrough — understand any codebase in 5 minutes

Usage:
  walkthrough [path]     Scan a project and open visualizer
  walkthrough .          Scan current directory
  walkthrough observe <path> --host claude
  walkthrough observe <path> --host codex --prompt "<task>"

Options:
  --json                Output codemap.json to stdout
  --output <path>       Write JSON to custom path
  --port <number>       Dev server port (default: 3000)
  --no-serve            Write JSON and exit
  --host <name>         Agent host for observed session: claude or codex
  --prompt <task>       Required task for non-interactive Codex observation
  --teach               Ask observed agent for a short source-linked teaching note
  --lesson-context <file>  Print bounded source evidence as JSON for an AI lesson
  -h, --help            Show this help

Examples:
  npx walkthrough-cli ./my-project
  npx walkthrough-cli ./my-project --json > map.json
  npx walkthrough-cli ./my-project --port 8080
`);
}
