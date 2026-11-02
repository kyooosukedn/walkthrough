import { join, relative, extname, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";

import type { ImportGraph, ImportNode, ImportEdge, ProjectInfo, Analyzer, WorkspacePackage } from "../types.js";
import { resolvePythonImports, resolveGoImports, goModulePath, goPackageIndex, type GoModule } from "./lang-imports.js";
import { shouldSkipDir } from "./ignore.js";

const PARSEABLE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const IMPORT_RE = /(?:import\s+(?:type\s+)?(?:[^;'"]*?)\s+from\s+['"]([^'"]+)['"]|export\s+(?:type\s+)?(?:[^;'"]*?)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

export class ImportGraphAnalyzer implements Analyzer {
  name = "imports";

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ imports: ImportGraph }> {
    const files = await collectFiles(project.rootPath, project.rootPath);
    const fileSet = new Set(files);
    const aliases = await loadPathAliases(project.rootPath);
    const workspaces = project.workspaces ?? [];
    const nodes: ImportNode[] = files.map((f) => ({ id: f, type: "file" }));
    const edges: ImportEdge[] = [];
    const edgeIndex = new Map<string, ImportEdge>();

    // Go: imports are package paths under a go.mod module path (any go.mod in the repo)
    const goModules: GoModule[] = [];
    for (const f of files) {
      if (f !== "go.mod" && !f.endsWith("/go.mod")) continue;
      try {
        const path = goModulePath(await readFile(join(project.rootPath, f), "utf-8"));
        if (path) goModules.push({ path, dir: f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "" });
      } catch {
        // unreadable go.mod — skip
      }
    }
    const goIndex = goModules.length > 0 ? goPackageIndex(files) : new Map<string, string>();

    for (const file of files) {
      const fullPath = join(project.rootPath, file);
      const ext = extname(file);
      const isPy = ext === ".py";
      const isGo = ext === ".go" && goModules.length > 0;
      if (!PARSEABLE_EXTS.has(ext) && !isPy && !isGo) continue;

      try {
        const content = await readFile(fullPath, "utf-8");
        const dir = dirname(file);
        const found: Array<{ raw: string; to: string | null }> = isPy
          ? resolvePythonImports(file, content, fileSet)
          : isGo
            ? resolveGoImports(file, content, goModules, goIndex)
            : extractImports(content).map((raw) => ({
                raw,
                to: resolveImport(raw, dir, project.rootPath, fileSet, aliases, workspaces),
              }));

        for (const { raw, to: resolved } of found) {
          if (resolved && resolved !== file) {
            const key = file + "\0" + resolved;
            const existing = edgeIndex.get(key);
            if (existing) {
              existing.imports.push(raw);
            } else {
              const edge = { from: file, to: resolved, imports: [raw] };
              edgeIndex.set(key, edge);
              edges.push(edge);
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Add directory nodes for parent paths of files
    const dirSet = new Set<string>();
    for (const f of files) {
      const parts = f.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirSet.add(parts.slice(0, i).join("/"));
      }
    }
    for (const d of dirSet) {
      if (!fileSet.has(d)) nodes.push({ id: d, type: "directory" });
    }

    return { imports: { nodes, edges } };
  }
}

async function collectFiles(root: string, current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && shouldSkipDir(entry.name, join(current, entry.name))) continue;

    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, fullPath));
    } else {
      files.push(relative(root, fullPath).replace(/\\/g, "/"));
    }
  }

  return files;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = IMPORT_RE.exec(content)) !== null) {
    const spec = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (spec) imports.push(spec);
  }
  return imports;
}

/** A tsconfig `paths` alias: imports starting with `prefix` resolve under `targetDir`. */
export interface PathAlias {
  prefix: string;
  targetDir: string;
}

/** Load tsconfig path aliases from the root and immediate subdirectories (app/, etc.). */
async function loadPathAliases(root: string): Promise<PathAlias[]> {
  const out: PathAlias[] = [];
  const dirs = [root];
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      dirs.push(join(root, entry.name));
    }
  } catch { /* skip */ }

  for (const dir of dirs) {
    const tsconfigPath = join(dir, "tsconfig.json");
    if (!existsSync(tsconfigPath)) continue;
    try {
      const raw = await readFile(tsconfigPath, "utf-8");
      // tsconfig is JSONC. Strip comments only outside string literals —
      // a regex strip would eat string values like "@/*" in paths globs.
      let compilerOptions: Record<string, unknown> | undefined;
      try {
        compilerOptions = JSON.parse(raw)?.compilerOptions;
      } catch {
        compilerOptions = JSON.parse(stripJsoncComments(raw))?.compilerOptions;
      }
      const baseUrl = (compilerOptions?.baseUrl as string) ?? ".";
      const paths = (compilerOptions?.paths ?? {}) as Record<string, string[]>;
      for (const [prefix, targets] of Object.entries(paths)) {
        const target = targets?.[0];
        if (!target) continue;
        const star = prefix.endsWith("/*");
        out.push({
          prefix: star ? prefix.slice(0, -1) : prefix,
          targetDir: resolve(dir, baseUrl, star ? target.replace(/\/\*$/, "") : target),
        });
      }
    } catch { /* skip malformed tsconfig */ }
  }
  return out;
}

/** Remove // and /* *\/ comments that are outside string literals. */
function stripJsoncComments(source: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += source[i + 1] ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

export function resolveImport(
  raw: string,
  fromDir: string,
  root: string,
  allFiles: Set<string>,
  aliases: PathAlias[],
  workspaces: WorkspacePackage[] = [],
): string | null {
  // Strip .js/.jsx/.mjs/.cjs extensions from import paths (TS ESM convention)
  const stripped = raw.replace(/\.(js|jsx|mjs|cjs)$/, "");

  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
  const probe = (absNoExt: string): string | null => {
    const relPath = relative(root, absNoExt).replace(/\\/g, "/");
    for (const ext of extensions) {
      if (allFiles.has(relPath + ext)) return relPath + ext;
    }
    return null;
  };

  if (raw.startsWith(".")) {
    return probe(resolve(root, fromDir, stripped));
  }

  // tsconfig path aliases (e.g. "@/components" -> "./src/components")
  for (const alias of aliases) {
    if (raw.startsWith(alias.prefix)) {
      const hit = probe(resolve(alias.targetDir, stripped.slice(alias.prefix.length)));
      if (hit) return hit;
    }
  }

  // Monorepo packages: "@acme/ui" -> packages/ui/src/index.ts,
  // "@acme/ui/button" -> packages/ui/src/button.tsx
  for (const pkg of workspaces) {
    if (raw === pkg.name) return pkg.sourceEntry ?? null;
    if (raw.startsWith(pkg.name + "/")) {
      const sub = stripped.slice(pkg.name.length + 1);
      const hit = probe(resolve(root, pkg.dir, "src", sub)) ?? probe(resolve(root, pkg.dir, sub));
      if (hit) return hit;
    }
  }

  return null; // External package or unresolvable
}
