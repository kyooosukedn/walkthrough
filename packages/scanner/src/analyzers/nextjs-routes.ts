import { join } from "node:path";
import { readFile } from "node:fs/promises";

import type {
  Route,
  ProjectInfo,
  Analyzer,
  FileTreeNode,
  ImportGraph,
  AnalyzerOutput,
} from "../types.js";

const PAGE_FILES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js"]);
const ROUTE_HANDLER_FILES = new Set(["route.ts", "route.js"]);
const HTTP_METHOD_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/**
 * Extracts Next.js routes from the file tree:
 * - App Router `page.tsx` files → page routes
 * - App Router `route.ts` files → API routes, one per exported HTTP method
 * - Pages Router `pages/**` files → page routes, `pages/api/**` → API routes
 *
 * Route files' `calls` are derived from the import graph when available.
 */
export class NextJsRoutesAnalyzer implements Analyzer {
  name = "nextjs-routes";

  detect(project: ProjectInfo): boolean {
    return this.roots(project).length > 0;
  }

  async analyze(project: ProjectInfo): Promise<AnalyzerOutput> {
    const importGraph: ImportGraph | undefined = (project as ProjectInfo & { _imports?: ImportGraph })._imports;
    const callsByFile = new Map<string, string[]>();
    for (const edge of importGraph?.edges ?? []) {
      const list = callsByFile.get(edge.from) ?? [];
      list.push(edge.to);
      callsByFile.set(edge.from, list);
    }

    const routes: Route[] = [];
    const rootPath = project.rootPath;

    for (const { node, base, kind } of this.roots(project)) {
      await walk(node, base, kind);
    }

    async function walk(dir: FileTreeNode, urlBase: string, kind: "app" | "pages"): Promise<void> {
      for (const child of dir.children ?? []) {
        if (child.type !== "file") continue;

        if (kind === "app") {
          if (PAGE_FILES.has(child.name)) {
            routes.push({
              method: "GET",
              path: urlBase || "/",
              file: child.path,
              calls: callsByFile.get(child.path),
            });
          } else if (ROUTE_HANDLER_FILES.has(child.name)) {
            const methods = await extractMethods(join(rootPath, child.path));
            for (const method of methods) {
              routes.push({
                method,
                path: urlBase || "/",
                file: child.path,
                handler: method,
                calls: callsByFile.get(child.path),
              });
            }
          }
        } else {
          // Pages Router: every file is a route; `_app`/`_document` are framework files.
          if (child.name.startsWith("_")) continue;
          const stem = child.name.replace(/\.(tsx|ts|jsx|js)$/, "");
          if (stem === "index" || stem === "middleware") continue;
          const isApi = urlBase === "/api" || urlBase.startsWith("/api/");
          routes.push({
            method: "GET",
            path: joinUrl(urlBase, stem),
            file: child.path,
            handler: isApi ? "default export" : undefined,
            calls: callsByFile.get(child.path),
          });
        }
      }

      for (const child of dir.children ?? []) {
        if (child.type !== "directory") continue;
        // Route groups `(name)` add no URL segment but still contain routes.
        await walk(child, joinUrl(urlBase, dirSegment(child.name)), kind);
      }

    }

    routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    return { routes };
  }

  /** Find app/ and pages/ roots, including under src/. */
  private roots(project: ProjectInfo): Array<{ node: FileTreeNode; base: string; kind: "app" | "pages" }> {
    const out: Array<{ node: FileTreeNode; base: string; kind: "app" | "pages" }> = [];
    const tree = project.fileTree;
    if (!tree) return out;

    const srcDir = directChild(tree, "src");
    const candidates = srcDir ? [tree, srcDir] : [tree];
    for (const parent of candidates) {
      for (const kind of ["app", "pages"] as const) {
        const node = directChild(parent, kind);
        if (node) out.push({ node, base: "", kind });
      }
    }
    return out;
  }
}

function directChild(tree: FileTreeNode, name: string): FileTreeNode | undefined {
  return (tree.children ?? []).find((c) => c.type === "directory" && c.name === name);
}

/** `(group)` → null (no URL segment), `[param]` → `:param`, `[...slug]` → `:slug*`. */
function dirSegment(name: string): string | null {
  if (name.startsWith("(") && name.endsWith(")")) return null;
  if (name.startsWith("[...") && name.endsWith("]")) return `:${name.slice(4, -1)}*`;
  if (name.startsWith("[") && name.endsWith("]")) return `:${name.slice(1, -1)}`;
  return name;
}

function joinUrl(base: string, segment: string | null): string {
  if (segment === null) return base;
  const joined = `${base}/${segment}`;
  return joined === "" ? "/" : joined;
}

async function extractMethods(fullPath: string): Promise<Route["method"][]> {
  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    return [];
  }

  const methods = new Set<Route["method"]>();
  HTTP_METHOD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTTP_METHOD_RE.exec(content)) !== null) {
    methods.add(match[1] as Route["method"]);
  }
  return [...methods];
}
