import { join } from "node:path";
import { readFile } from "node:fs/promises";

import type {
  Route,
  ProjectInfo,
  Analyzer,
  FileTreeNode,
  AnalyzerOutput,
} from "../types.js";

const PARSEABLE_EXTS = new Set([".ts", ".js", ".mjs", ".cjs"]);
const EXPRESS_ROUTE_RE = /\b(?:app|router|server|api|r)\.(get|post|put|patch|delete)\s*\(\s*["'`](\/[^"'`]*)["'`]/g;
const MAX_FILE_BYTES = 1_000_000;

/**
 * Extracts Express routes: `app.METHOD("path", ...)` and the same on
 * routers, across all parseable source files. Router mount prefixes
 * (`app.use("/x", router)`) are not resolved in v1 — paths are as written.
 */
export class ExpressRoutesAnalyzer implements Analyzer {
  name = "express-routes";

  detect(project: ProjectInfo): boolean {
    const deps = {
      ...(project.packageJson?.dependencies as Record<string, string> | undefined),
      ...(project.packageJson?.devDependencies as Record<string, string> | undefined),
    };
    return deps?.express !== undefined;
  }

  async analyze(project: ProjectInfo): Promise<AnalyzerOutput> {
    const routes: Route[] = [];

    for (const filePath of findParseableFiles(project.fileTree)) {
      let content: string;
      try {
        content = await readFile(join(project.rootPath, filePath), "utf-8");
      } catch {
        continue;
      }
      if (content.length > MAX_FILE_BYTES) continue;

      EXPRESS_ROUTE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = EXPRESS_ROUTE_RE.exec(content)) !== null) {
        routes.push({ method: match[1].toUpperCase() as Route["method"], path: match[2], file: filePath });
      }
    }

    routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    return { routes };
  }
}

function findParseableFiles(tree?: FileTreeNode): string[] {
  const out: string[] = [];

  function walk(node: FileTreeNode): void {
    for (const child of node.children ?? []) {
      if (child.type === "directory") walk(child);
      else {
        const ext = child.name.slice(child.name.lastIndexOf("."));
        if (PARSEABLE_EXTS.has(ext)) out.push(child.path);
      }
    }
  }

  if (tree) walk(tree);
  return out;
}
