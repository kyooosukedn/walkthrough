import { basename, join, extname, relative, dirname } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

import type { EntryPoint, ProjectInfo, FileTreeNode, Analyzer } from "../types.js";
import { shouldSkipDir } from "./ignore.js";
import { collectFilePaths, toSourcePath } from "./workspaces.js";

/** Patterns for detecting entry points */
const FILE_PATTERNS: Array<{
  match: RegExp;
  type: EntryPoint["type"];
  /** Only match if the file is at this depth or less from root */
  maxDepth?: number;
}> = [
  { match: /^page\.(tsx|jsx|ts|js)$/, type: "page" },
  { match: /^layout\.(tsx|jsx|ts|js)$/, type: "layout" },
  { match: /^route\.(tsx|jsx|ts|js)$/, type: "server" },
  { match: /^server\.(tsx|jsx|ts|js)$/, type: "server" },
  { match: /^cli\.(tsx|jsx|ts|js)$/, type: "cli" },
  { match: /^worker\.(tsx|jsx|ts|js)$/, type: "worker" },
  { match: /^main\.(tsx|jsx|ts|js)$/, type: "server", maxDepth: 2 },
  { match: /^index\.(tsx|jsx|ts|js)$/, type: "server", maxDepth: 1 },
  { match: /^app\.(tsx|jsx|ts|js)$/, type: "server", maxDepth: 1 },
  { match: /^(__main__|main|app|manage)\.py$/, type: "server", maxDepth: 3 },
  { match: /^main\.go$/, type: "cli", maxDepth: 3 },
  { match: /^main\.rs$/, type: "cli", maxDepth: 2 },
];

export class EntryPointAnalyzer implements Analyzer {
  name = "entry-points";

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ entryPoints: EntryPoint[] }> {
    const entryPoints: EntryPoint[] = [];

    // package.json main/bin — mapped from build output (dist/) back to source,
    // and dropped if the file isn't in the scanned project
    if (project.packageJson) {
      const pkg = project.packageJson;
      const fileSet = project.fileTree ? collectFilePaths(project.fileTree) : new Set<string>();
      const add = (target: unknown, type: EntryPoint["type"], fallback: boolean) => {
        if (typeof target !== "string") return;
        const file = toSourcePath("", target, fileSet, fallback);
        if (file) entryPoints.push({ file, type });
      };
      const bins = typeof pkg.bin === "string" ? [pkg.bin]
        : pkg.bin && typeof pkg.bin === "object" ? Object.values(pkg.bin as Record<string, unknown>) : [];
      for (const bin of bins) add(bin, "cli", false);
      add(pkg.main, "server", false);
    }

    // Monorepo packages' bin commands are real entry points too
    for (const ws of project.workspaces ?? []) {
      for (const bin of ws.bins) entryPoints.push({ file: bin, type: "cli" });
    }

    // Entries declared in package.json are authoritative; rank them first.
    const declared = new Set(entryPoints.map((e) => e.file));

    // Walk filesystem looking for entry point files
    const files = await collectSourceFiles(project.rootPath, project.rootPath);

    for (const file of files) {
      const relPath = file; // already relative
      const name = basename(relPath);
      // Inside a monorepo package, measure depth from that package's folder
      const ws = (project.workspaces ?? []).find((w) => relPath.startsWith(w.dir + "/"));
      const depth = (ws ? relPath.slice(ws.dir.length + 1) : relPath).split("/").length - 1;

      for (const pattern of FILE_PATTERNS) {
        if (pattern.match.test(name)) {
          if (/^(page|layout|route)\./.test(name) && !relPath.split("/").includes("app")) continue;
          if (pattern.maxDepth !== undefined && depth > pattern.maxDepth) continue;

          // Skip barrel exports in subdirectories
          if (name.startsWith("index.") && depth > 1) continue;
          // A React component named server.tsx / cli.tsx is not a process entry
          if (/\.(tsx|jsx)$/.test(name) && pattern.type !== "page" && pattern.type !== "layout"
            && relPath.split("/").includes("components")) continue;

          const ep: EntryPoint = { file: relPath, type: pattern.type };

          // Detect routes for pages/layouts (Next.js app router pattern)
          const parts = relPath.split("/");
          const appIdx = parts.indexOf("app");
          if (appIdx >= 0 && (pattern.type === "page" || pattern.type === "layout")) {
            ep.route = "/" + parts.slice(appIdx + 1, -1).join("/");
            if (ep.route !== "/" && ep.route.endsWith("/")) ep.route = ep.route.slice(0, -1);
            if (!ep.route.startsWith("/")) ep.route = "/" + ep.route;
          }

          entryPoints.push(ep);
          break;
        }
      }
    }

    return { entryPoints: rankEntryPoints(deduplicate(entryPoints), declared) };
  }
}

/** Path segments that mark code a newcomer should not start from. */
const NOISE_SEGMENTS = new Set([
  "test", "tests", "__tests__", "spec", "specs", "e2e", "integration-tests",
  "__fixtures__", "fixtures", "__mocks__", "mocks",
  "example", "examples", "sample", "samples", "demo", "demos",
  "template", "templates", "scaffold", "playground", "benchmarks", "bench",
]);

const TEST_FILE_RE = /[._-](test|spec)\.[cm]?[jt]sx?$|^test_.*\.py$|_test\.(py|go)$/;

/** True for tests, fixtures, examples, templates and dot-folders. */
export function isNoisePath(file: string): boolean {
  const segs = file.split("/");
  return segs.some((seg) => NOISE_SEGMENTS.has(seg.toLowerCase()) || seg.startsWith("."))
    || TEST_FILE_RE.test(segs[segs.length - 1]);
}

/**
 * Order entry points so the most useful starting files come first.
 * Declared entries (package.json main/bin) win, then shallow files.
 * Test/fixture/example/template entries are dropped when real ones exist.
 */
export function rankEntryPoints(entries: EntryPoint[], declared: Set<string> = new Set()): EntryPoint[] {
  const real = entries.filter((e) => !isNoisePath(e.file));
  const pool = real.length > 0 ? real : entries;
  const score = (e: EntryPoint) =>
    (declared.has(e.file) ? 0 : 100) +
    e.file.split("/").length * 10 +
    (e.type === "layout" ? 5 : 0);
  return pool
    .map((e, i) => ({ e, i }))
    .sort((a, b) => score(a.e) - score(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

async function collectSourceFiles(root: string, current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && shouldSkipDir(entry.name, join(current, entry.name))) continue;

    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(root, fullPath));
    } else {
      const ext = extname(entry.name);
      if ([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"].includes(ext)) {
        files.push(relative(root, fullPath).replace(/\\/g, "/"));
      }
    }
  }

  return files;
}

function deduplicate(entries: EntryPoint[]): EntryPoint[] {
  const seen = new Set<string>();
  return entries.filter((ep) => {
    const key = ep.file;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
