import { basename, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import type {
  CodeMap,
  CodeMapMeta,
  CodeMapStats,
  ProjectInfo,
  Analyzer,
  AnalyzerOutput,
  EntryPoint,
  ImportGraph,
  FrameworkDetection,
  Route,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { FileTreeAnalyzer } from "./analyzers/file-tree.js";
import { ImportGraphAnalyzer } from "./analyzers/imports.js";
import { EntryPointAnalyzer } from "./analyzers/entry-points.js";
import { TourGeneratorAnalyzer } from "./analyzers/tour-generator.js";
import { NextJsRoutesAnalyzer } from "./analyzers/nextjs-routes.js";
import { ReactComponentAnalyzer } from "./analyzers/react-components.js";

/**
 * Scan a project and produce a CodeMap blueprint.
 *
 * Pipeline:
 * 1. Build ProjectInfo (root path, package.json, etc.)
 * 2. Run FileTreeAnalyzer (always, provides tree + stats)
 * 3. Run ImportGraphAnalyzer (always, needs file paths)
 * 4. Run EntryPointAnalyzer (always, needs naming patterns)
 * 5. Run TourGeneratorAnalyzer (last, uses all outputs)
 * 6. Merge into CodeMap
 */
export async function scan(rootPath: string): Promise<CodeMap> {
  const project = await buildProjectInfo(rootPath);

  // Phase 1: File tree (needed by downstream analyzers)
  const fileTreeAnalyzer = new FileTreeAnalyzer();
  const treeOutput = await fileTreeAnalyzer.analyze(project);
  project.fileTree = treeOutput.fileTree;

  // Phase 2: Imports + Entry points (parallel, both need file tree)
  const importAnalyzer = new ImportGraphAnalyzer();
  const entryAnalyzer = new EntryPointAnalyzer();

  const [importOutput, entryOutput] = await Promise.all([
    importAnalyzer.analyze(project),
    entryAnalyzer.analyze(project),
  ]);

  // Phase 3: Routes (needs file tree + import graph for `calls`)
  const routesAnalyzer = new NextJsRoutesAnalyzer();
  const routesEnriched: ProjectInfo & { _imports?: ImportGraph } = {
    ...project,
    _imports: importOutput.imports,
  };
  const routesOutput = routesAnalyzer.detect(routesEnriched) ? await routesAnalyzer.analyze(routesEnriched) : undefined;

  // Phase 3.5: Components (needs file tree + import graph)
  const componentsAnalyzer = new ReactComponentAnalyzer();
  const componentsOutput = componentsAnalyzer.detect(routesEnriched)
    ? await componentsAnalyzer.analyze(routesEnriched)
    : undefined;

  // Phase 4: Tour generator (needs all other outputs)
  const tourAnalyzer = new TourGeneratorAnalyzer();
  const enrichedProject: ProjectInfo & { _entryPoints?: EntryPoint[]; _imports?: ImportGraph; _frameworks?: string[]; _routes?: Route[] } = {
    ...project,
    _entryPoints: entryOutput.entryPoints,
    _imports: importOutput.imports,
    _frameworks: detectFrameworks(project).map((f) => f.name),
    _routes: routesOutput?.routes,
  };
  const tourOutput = await tourAnalyzer.analyze(enrichedProject);

  // Merge all outputs
  const outputs: AnalyzerOutput[] = [treeOutput, importOutput, entryOutput, tourOutput];
  if (routesOutput) outputs.push(routesOutput);
  if (componentsOutput) outputs.push(componentsOutput);
  return mergeOutputs(project, outputs);
}

/** Extract project metadata from the filesystem */
async function buildProjectInfo(rootPath: string): Promise<ProjectInfo> {
  const project: ProjectInfo = { rootPath };

  const pkgPath = join(rootPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, "utf-8");
      project.packageJson = JSON.parse(raw);
    } catch {
      // Not a JS project or malformed — that's fine
    }
  }

  return project;
}

/** Merge all analyzer outputs into a single CodeMap */
function mergeOutputs(project: ProjectInfo, outputs: AnalyzerOutput[]): CodeMap {
  let fileTree: CodeMap["fileTree"] = {
    name: basename(project.rootPath),
    path: ".",
    type: "directory",
    children: [],
  };
  let stats: CodeMapStats = { files: 0, directories: 0, totalLines: 0 };
  let entryPoints: EntryPoint[] | undefined;
  let imports: ImportGraph | undefined;
  let routes: Route[] | undefined;
  let components: CodeMap["components"];
  let tour: CodeMap["tour"];

  for (const output of outputs) {
    if (output.fileTree) fileTree = output.fileTree;
    if (output.stats) stats = output.stats;
    if (output.entryPoints) entryPoints = output.entryPoints;
    if (output.imports) imports = output.imports;
    if (output.routes) routes = output.routes;
    if (output.components) components = output.components;
    if (output.tour) tour = output.tour;
  }

  const meta: CodeMapMeta = {
    name: (project.packageJson?.name as string) || basename(project.rootPath),
    version: SCHEMA_VERSION,
    scannedAt: new Date().toISOString(),
    frameworks: detectFrameworks(project),
    language: detectLanguage(project),
    stats,
  };

  return { meta, fileTree, entryPoints, imports, routes, components, tour };
}

/** Detect frameworks from package.json dependencies (including workspace packages) */
function detectFrameworks(project: ProjectInfo): FrameworkDetection[] {
  // Merge root deps
  const allDeps: Record<string, string> = {
    ...(project.packageJson?.dependencies as Record<string, string>),
    ...(project.packageJson?.devDependencies as Record<string, string>),
  };

  // For monorepos, also check workspace package.json files; otherwise fall
  // back to immediate subdirectories (e.g. app/, frontend/) so non-workspace
  // layouts like `root + app/package.json` still detect their frameworks.
  const workspaces = project.packageJson?.workspaces;
  if (Array.isArray(workspaces)) {
    for (const pattern of workspaces) {
      // Expand glob pattern (e.g. "packages/*")
      const dir = pattern.replace(/\/?\*+$/, "");
      mergeSubdirDeps(join(project.rootPath, dir));
    }
  } else {
    // Non-workspace layout: scan immediate subdirectories of the root.
    mergeSubdirDeps(project.rootPath);
  }

  function mergeSubdirDeps(base: string): void {
    if (!existsSync(base)) return;
    try {
      const entries = readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const wsPkgPath = join(base, entry.name, "package.json");
        if (existsSync(wsPkgPath)) {
          try {
            const raw = readFileSync(wsPkgPath, "utf-8");
            const wsPkg = JSON.parse(raw);
            Object.assign(allDeps, wsPkg.dependencies ?? {}, wsPkg.devDependencies ?? {});
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  const frameworks: FrameworkDetection[] = [];

  const checks: Array<{ pkg: string; name: string }> = [
    { pkg: "next", name: "next.js" },
    { pkg: "express", name: "express" },
    { pkg: "@angular/core", name: "angular" },
    { pkg: "vue", name: "vue" },
    { pkg: "@sveltejs/kit", name: "sveltekit" },
    { pkg: "react", name: "react" },
    { pkg: "react-native", name: "react-native" },
    { pkg: "expo", name: "expo" },
    { pkg: "@nestjs/core", name: "nestjs" },
    { pkg: "nuxt", name: "nuxt" },
    { pkg: "astro", name: "astro" },
    { pkg: "@remix-run/react", name: "remix" },
    { pkg: "fastify", name: "fastify" },
    { pkg: "hono", name: "hono" },
    { pkg: "vite", name: "vite" },
  ];
  for (const { pkg, name } of checks) {
    if (allDeps[pkg]) {
      frameworks.push({ name, confidence: 1, version: allDeps[pkg] });
    }
  }

  return frameworks;
}

/** Detect primary language from file extensions or config files */
function detectLanguage(project: ProjectInfo): string {
  const has = (name: string, dir: string = project.rootPath) =>
    existsSync(join(dir, name));

  // Root-level config files first, then immediate subdirectories for
  // non-workspace layouts (e.g. app/tsconfig.json).
  if (has("tsconfig.json") || has("tsconfig.base.json")) return "typescript";
  if (has("pyproject.toml")) return "python";
  if (has("go.mod")) return "go";
  if (has("Cargo.toml")) return "rust";

  try {
    const entries = readdirSync(project.rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const dir = join(project.rootPath, entry.name);
      if (has("tsconfig.json", dir)) return "typescript";
      if (has("pyproject.toml", dir)) return "python";
      if (has("go.mod", dir)) return "go";
      if (has("Cargo.toml", dir)) return "rust";
    }
  } catch { /* skip */ }

  return "unknown";
}
