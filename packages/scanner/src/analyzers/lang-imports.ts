/**
 * Import extraction for Python and Go. Same philosophy as the JS/TS path:
 * a cheap regex pass that captures the shape of the dependency graph,
 * resolved only against files that exist in the scanned project.
 */

export interface ResolvedImport {
  raw: string;
  to: string;
}

// ─── Python ──────────────────────────────────────────────────

const PY_FROM_RE = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+\(?([^\n#]*)/gm;
const PY_IMPORT_RE = /^[ \t]*import[ \t]+([\w., \t]+)/gm;

export function resolvePythonImports(file: string, content: string, files: Set<string>): ResolvedImport[] {
  const out: ResolvedImport[] = [];
  const fileDir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const ancestors = ancestorsOf(fileDir);

  const tryModule = (bases: string[], modPath: string, names: string[]): string[] => {
    for (const base of bases) {
      const prefix = [base, modPath].filter(Boolean).join("/");
      // "from pkg import submodule" — link to the submodule files when they exist
      const subs = names
        .map((n) => [prefix, n].filter(Boolean).join("/"))
        .flatMap((p) => [`${p}.py`, `${p}/__init__.py`])
        .filter((p) => files.has(p));
      if (subs.length > 0) return subs;
      if (!modPath) continue;
      for (const candidate of [`${prefix}.py`, `${prefix}/__init__.py`]) {
        if (files.has(candidate)) return [candidate];
      }
    }
    return [];
  };

  let m: RegExpExecArray | null;
  PY_FROM_RE.lastIndex = 0;
  while ((m = PY_FROM_RE.exec(content)) !== null) {
    const [, dots, module, namesRaw] = m;
    const names = namesRaw.split(",").map((n) => n.trim().split(/\s+/)[0]).filter((n) => /^\w+$/.test(n));
    const modPath = module.replace(/\./g, "/");
    let bases: string[];
    if (dots.length > 0) {
      let base = fileDir;
      for (let i = 1; i < dots.length; i++) base = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
      bases = [base];
    } else {
      bases = ancestors;
    }
    for (const to of tryModule(bases, modPath, names)) out.push({ raw: `${dots}${module}`, to });
  }

  PY_IMPORT_RE.lastIndex = 0;
  while ((m = PY_IMPORT_RE.exec(content)) !== null) {
    for (const part of m[1].split(",")) {
      const module = part.trim().split(/\s+/)[0];
      if (!module) continue;
      for (const to of tryModule(ancestors, module.replace(/\./g, "/"), [])) out.push({ raw: module, to });
    }
  }
  return out.filter((r) => r.to !== file);
}

/** "a/b/c" -> ["a/b/c", "a/b", "a", ""] — candidate import roots, nearest first. */
function ancestorsOf(dir: string): string[] {
  const parts = dir ? dir.split("/") : [];
  const out: string[] = [];
  for (let i = parts.length; i >= 0; i--) out.push(parts.slice(0, i).join("/"));
  return out;
}

// ─── Go ──────────────────────────────────────────────────────

const GO_IMPORT_BLOCK_RE = /^import\s*\(([\s\S]*?)\)/gm;
const GO_IMPORT_SINGLE_RE = /^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm;
const QUOTED_RE = /"([^"]+)"/g;

export function goModulePath(goMod: string): string | undefined {
  return /^module\s+(\S+)/m.exec(goMod)?.[1];
}

/** Map each directory to a representative non-test .go file (alphabetically first). */
export function goPackageIndex(files: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const f of [...files].sort()) {
    if (!f.endsWith(".go") || f.endsWith("_test.go")) continue;
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
    if (!index.has(dir)) index.set(dir, f);
  }
  return index;
}

export function resolveGoImports(file: string, content: string, modulePath: string | undefined, pkgIndex: Map<string, string>): ResolvedImport[] {
  if (!modulePath) return [];
  const specs: string[] = [];
  let m: RegExpExecArray | null;
  GO_IMPORT_BLOCK_RE.lastIndex = 0;
  while ((m = GO_IMPORT_BLOCK_RE.exec(content)) !== null) {
    let q: RegExpExecArray | null;
    QUOTED_RE.lastIndex = 0;
    while ((q = QUOTED_RE.exec(m[1])) !== null) specs.push(q[1]);
  }
  GO_IMPORT_SINGLE_RE.lastIndex = 0;
  while ((m = GO_IMPORT_SINGLE_RE.exec(content)) !== null) specs.push(m[1]);

  const out: ResolvedImport[] = [];
  for (const spec of specs) {
    if (spec !== modulePath && !spec.startsWith(modulePath + "/")) continue;
    const dir = spec === modulePath ? "" : spec.slice(modulePath.length + 1);
    const to = pkgIndex.get(dir);
    if (to && to !== file) out.push({ raw: spec, to });
  }
  return out;
}
