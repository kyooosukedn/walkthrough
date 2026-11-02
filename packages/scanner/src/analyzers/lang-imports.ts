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

// "from x import a" / "from x import (a,\n b)" — the parenthesised form may span lines
const PY_FROM_RE = /^[ \t]*from[ \t]+(\.{0,64})([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]*)/gm;
const PY_IMPORT_RE = /^[ \t]*import[ \t]+([\w., \t]+)/gm;

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

const rootsCache = new WeakMap<Set<string>, string[]>();

/**
 * Folders that absolute imports resolve from (like sys.path entries):
 * the parent of every top-level package, folders holding pyproject.toml /
 * setup.py, and the repo root. Python 3 never resolves "import x" relative to
 * the importing file, so neither do we.
 */
export function pythonRoots(files: Set<string>): string[] {
  const cached = rootsCache.get(files);
  if (cached) return cached;
  const roots = new Set<string>([""]);
  for (const f of files) {
    const name = f.slice(f.lastIndexOf("/") + 1);
    if (name === "pyproject.toml" || name === "setup.py" || name === "setup.cfg") roots.add(parentOf(f));
    if (name === "__init__.py") {
      let pkg = parentOf(f);
      while (files.has(`${parentOf(pkg)}/__init__.py`) && pkg.includes("/")) pkg = parentOf(pkg);
      roots.add(parentOf(pkg));
    }
  }
  const list = [...roots].sort((a, b) => b.length - a.length);
  rootsCache.set(files, list);
  return list;
}

export function resolvePythonImports(file: string, content: string, files: Set<string>): ResolvedImport[] {
  const out: ResolvedImport[] = [];
  const fileDir = parentOf(file);
  const roots = pythonRoots(files);

  const tryModule = (bases: string[], modPath: string, names: string[]): string[] => {
    for (const base of bases) {
      const prefix = [base, modPath].filter(Boolean).join("/");
      // "from pkg import submodule" — link to the submodule files when they exist
      const subs = names
        .map((n) => [prefix, n].filter(Boolean).join("/"))
        .flatMap((p) => [`${p}.py`, `${p}/__init__.py`])
        .filter((p) => files.has(p));
      if (subs.length > 0) return subs;
      // "from pkg import name" where name lives in pkg/__init__.py (or pkg.py)
      const candidates = modPath ? [`${prefix}.py`, `${prefix}/__init__.py`] : [`${prefix ? prefix + "/" : ""}__init__.py`];
      for (const candidate of candidates) {
        if (files.has(candidate)) return [candidate];
      }
    }
    return [];
  };

  let m: RegExpExecArray | null;
  PY_FROM_RE.lastIndex = 0;
  while ((m = PY_FROM_RE.exec(content)) !== null) {
    const [, dots, module, namesRaw] = m;
    const names = namesRaw
      .replace(/[()]/g, "")
      .split(",")
      .map((n) => n.trim().split(/\s+/)[0])
      .filter((n) => /^\w+$/.test(n));
    const modPath = module.replace(/\./g, "/");
    let bases: string[];
    if (dots.length > 0) {
      // One dot = this package; each extra dot climbs one level. Climbing
      // past the repo root is an error in Python — resolve nothing.
      const depth = fileDir ? fileDir.split("/").length : 0;
      if (dots.length - 1 > depth) continue;
      let base = fileDir;
      for (let i = 1; i < dots.length; i++) base = parentOf(base);
      bases = [base];
    } else {
      if (!modPath) continue;
      bases = roots;
    }
    for (const to of tryModule(bases, modPath, names)) out.push({ raw: `${dots}${module}`, to });
  }

  PY_IMPORT_RE.lastIndex = 0;
  while ((m = PY_IMPORT_RE.exec(content)) !== null) {
    for (const part of m[1].split(",")) {
      const module = part.trim().split(/\s+/)[0];
      if (!module) continue;
      for (const to of tryModule(roots, module.replace(/\./g, "/"), [])) out.push({ raw: module, to });
    }
  }
  return out.filter((r) => r.to !== file);
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

/** A Go module in the repo: its import path and the folder holding its go.mod. */
export interface GoModule {
  path: string;
  dir: string;
}

export function resolveGoImports(file: string, content: string, modules: GoModule[], pkgIndex: Map<string, string>): ResolvedImport[] {
  if (modules.length === 0) return [];
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
    // Longest matching module path wins (nested modules inside one repo)
    const mod = modules
      .filter((mo) => spec === mo.path || spec.startsWith(mo.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!mod) continue;
    const rest = spec === mod.path ? "" : spec.slice(mod.path.length + 1);
    const dir = [mod.dir, rest].filter(Boolean).join("/");
    const to = pkgIndex.get(dir);
    if (to && to !== file) out.push({ raw: spec, to });
  }
  return out;
}
