import { basename, join, extname, relative, dirname } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

import type { EntryPoint, ProjectInfo, FileTreeNode, Analyzer } from "../types.js";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", ".cache", ".turbo", ".vercel", "__pycache__",
]);

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
];

export class EntryPointAnalyzer implements Analyzer {
  name = "entry-points";

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ entryPoints: EntryPoint[] }> {
    const entryPoints: EntryPoint[] = [];

    // Check package.json for main/bin fields
    if (project.packageJson) {
      const pkg = project.packageJson;
      if (typeof pkg.main === "string") {
        entryPoints.push({ file: normalizePath(pkg.main), type: "server" });
      }
      if (typeof pkg.bin === "string") {
        entryPoints.push({ file: normalizePath(pkg.bin), type: "cli" });
      }
      if (typeof pkg.bin === "object") {
        for (const bin of Object.values(pkg.bin as Record<string, string>)) {
          entryPoints.push({ file: normalizePath(bin), type: "cli" });
        }
      }
    }

    // Walk filesystem looking for entry point files
    const files = await collectSourceFiles(project.rootPath, project.rootPath);

    for (const file of files) {
      const relPath = file; // already relative
      const name = basename(relPath);
      const depth = relPath.split("/").length - 1;

      for (const pattern of FILE_PATTERNS) {
        if (pattern.match.test(name)) {
          if (pattern.maxDepth !== undefined && depth > pattern.maxDepth) continue;

          // Skip barrel exports in subdirectories
          if (name.startsWith("index.") && depth > 1) continue;

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

    return { entryPoints: deduplicate(entryPoints) };
  }
}

async function collectSourceFiles(root: string, current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(root, fullPath));
    } else {
      const ext = extname(entry.name);
      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        files.push(relative(root, fullPath).replace(/\\/g, "/"));
      }
    }
  }

  return files;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function deduplicate(entries: EntryPoint[]): EntryPoint[] {
  const seen = new Set<string>();
  return entries.filter((ep) => {
    const key = `${ep.file}:${ep.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
