import { join } from "node:path";
import { readFile } from "node:fs/promises";

import type { FileTreeNode, WorkspacePackage } from "../types.js";
import { isNoisePath } from "./entry-points.js";

/**
 * Find the packages inside a monorepo (any non-root package.json up to 3
 * levels deep), so imports like "@acme/ui" can be linked to their source.
 */
export async function findWorkspacePackages(rootPath: string, tree: FileTreeNode, fileSet: Set<string>): Promise<WorkspacePackage[]> {
  const manifests: string[] = [];
  const walk = (node: FileTreeNode, depth: number) => {
    for (const child of node.children ?? []) {
      if (child.type === "file" && child.name === "package.json" && depth > 0) manifests.push(child.path);
      if (child.type === "directory" && depth < 3 && !isNoisePath(child.path)) walk(child, depth + 1);
    }
  };
  walk(tree, 0);

  const packages: WorkspacePackage[] = [];
  for (const manifest of manifests) {
    try {
      const pkg = JSON.parse(await readFile(join(rootPath, manifest), "utf-8"));
      if (typeof pkg.name !== "string") continue;
      const dir = manifest.slice(0, -"/package.json".length);
      const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {}).filter((b): b is string => typeof b === "string");
      const mainTarget = [pkg.source, pkg.module, pkg.main, typeof pkg.exports === "string" ? pkg.exports : undefined]
        .find((t): t is string => typeof t === "string");
      packages.push({
        name: pkg.name,
        dir,
        description: typeof pkg.description === "string" ? pkg.description : undefined,
        sourceEntry: toSourcePath(dir, mainTarget, fileSet),
        bins: bins.map((b) => toSourcePath(dir, b, fileSet)).filter((b): b is string => !!b),
      });
    } catch {
      // Malformed package.json — skip
    }
  }
  return packages;
}

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/**
 * Map a published path (often build output like "./dist/index.js") back to
 * the source file a reader should open ("src/index.ts").
 */
export function toSourcePath(dir: string, target: string | undefined, fileSet: Set<string>): string | undefined {
  const rel = (target ?? "").replace(/^\.\//, "");
  const noExt = rel.replace(/\.(m?js|cjs|jsx?|tsx?)$/, "");
  const candidates: string[] = [];
  if (rel) {
    candidates.push(rel);
    const srcSwapped = noExt.replace(/^(dist|build|lib|out|esm|cjs)\//, "src/");
    for (const ext of SOURCE_EXTS) candidates.push(srcSwapped + ext, noExt + ext);
  }
  for (const ext of SOURCE_EXTS) candidates.push(`src/index${ext}`, `index${ext}`);
  for (const c of candidates) {
    const full = `${dir}/${c}`;
    if (fileSet.has(full)) return full;
  }
  return undefined;
}

/** Collect every file path in the tree. */
export function collectFilePaths(tree: FileTreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: FileTreeNode) => {
    if (n.type === "file") out.add(n.path);
    else for (const c of n.children ?? []) walk(c);
  };
  walk(tree);
  return out;
}
