import { join, relative, extname, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";

import type { ImportGraph, ImportNode, ImportEdge, ProjectInfo, Analyzer } from "../types.js";
import { mapBounded, SCANNER_READ_CONCURRENCY } from "./ordered-map.js";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", ".cache", ".turbo", ".vercel", "__pycache__",
]);

const PARSEABLE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const IMPORT_RE = /(?:import\s+(?:type\s+)?(?:[^;'"]*?)\s+from\s+['"]([^'"]+)['"]|export\s+(?:type\s+)?(?:[^;'"]*?)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

export class ImportGraphAnalyzer implements Analyzer {
  name = "imports";

  constructor(private readonly readSource: (path: string) => Promise<string> = (path) => readFile(path, "utf8")) {}

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ imports: ImportGraph }> {
    const files = await collectFiles(project.rootPath, project.rootPath);
    const fileSet = new Set(files);
    const aliases = await loadPathAliases(project.rootPath);
    const nodes: ImportNode[] = files.map((f) => ({ id: f, type: "file" }));
    const edges: ImportEdge[] = [];
    const edgeByPair = new Map<string, ImportEdge>();

    const importsByFile = await mapBounded(files, SCANNER_READ_CONCURRENCY, async (file) => {
      const ext = extname(file);
      if (!PARSEABLE_EXTS.has(ext)) return [];

      try {
        return extractImports(await this.readSource(join(project.rootPath, file)));
      } catch {
        // Skip unreadable files
        return [];
      }
    });

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const dir = dirname(file);
      for (const raw of importsByFile[index]) {
        const resolved = resolveImport(raw, dir, project.rootPath, fileSet, aliases);
        if (!resolved) continue;
        const key = `${file}\0${resolved}`;
        const existing = edgeByPair.get(key);
        if (existing) existing.imports.push(raw);
        else {
          const edge = { from: file, to: resolved, imports: [raw] };
          edges.push(edge);
          edgeByPair.set(key, edge);
        }
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
    const nodeIds = new Set(files);
    for (const d of dirSet) if (!nodeIds.has(d)) nodes.push({ id: d, type: "directory" });

    return { imports: { nodes, edges } };
  }
}

async function collectFiles(root: string, current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;

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
interface PathAlias {
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

function resolveImport(raw: string, fromDir: string, root: string, allFiles: Set<string>, aliases: PathAlias[]): string | null {
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

  return null; // External package or unresolvable
}
