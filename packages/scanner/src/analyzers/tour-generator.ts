import { basename } from "node:path";

import type {
  TourDefinition,
  TourStep,
  EntryPoint,
  Route,
  ProjectInfo,
  Analyzer,
  FileTreeNode,
} from "../types.js";
import { isNoisePath } from "./entry-points.js";

export class TourGeneratorAnalyzer implements Analyzer {
  name = "tour-generator";

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ tour: TourDefinition }> {
    return { tour: generateTour(project) };
  }
}

/** One-line explanations for conventional directory names. */
const DIR_ROLES: Record<string, string> = {
  src: "main source code",
  lib: "core library code",
  app: "application code (routes/pages in many frameworks)",
  apps: "deployable applications in this monorepo",
  packages: "shared packages in this monorepo",
  pkg: "public Go packages",
  internal: "private implementation code",
  cmd: "executable entry points",
  api: "API handlers and endpoints",
  routes: "request routing",
  server: "server-side code",
  backend: "the backend service",
  frontend: "the frontend client",
  web: "the web client",
  client: "client-side code",
  components: "reusable UI components",
  pages: "page-level views",
  hooks: "reusable React hooks",
  models: "data models",
  schemas: "data schemas and validation",
  db: "database access",
  database: "database access",
  migrations: "database schema history",
  prisma: "Prisma schema and migrations",
  services: "business logic services",
  core: "core logic and settings",
  utils: "shared helpers",
  helpers: "shared helpers",
  config: "configuration",
  public: "static assets served as-is",
  static: "static assets",
  assets: "images, fonts and other assets",
  styles: "stylesheets",
  scripts: "developer and build scripts",
  docs: "documentation",
  test: "tests",
  tests: "tests",
  __tests__: "tests",
  e2e: "end-to-end tests",
  examples: "usage examples",
  types: "shared type definitions",
  middleware: "request middleware",
  crates: "Rust crates in this workspace",
  deploy: "deployment configuration",
  infra: "infrastructure configuration",
};

const GENERIC_NAMES = new Set(["root", "monorepo", "workspace", "app", "project"]);

const CONFIG_FILES = new Set([
  "package.json", "tsconfig.json", "tsconfig.base.json", ".env.example",
  "pyproject.toml", "requirements.txt", "setup.py", "go.mod", "Cargo.toml",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
  "Makefile", "README.md",
]);

const SOURCE_DIR_NAMES = ["src", "lib", "app", "packages", "apps", "internal", "pkg", "cmd", "crates", "backend", "server"];

export function projectName(project: ProjectInfo): string {
  const raw = project.packageJson?.name;
  if (typeof raw === "string" && raw.trim()) {
    const bare = raw.replace(/^@[^/]+\//, "");
    if (!GENERIC_NAMES.has(bare.toLowerCase())) return raw;
  }
  return basename(project.rootPath) || "this project";
}

function describeDir(name: string): string {
  const role = DIR_ROLES[name.toLowerCase()];
  return role ? `\`${name}/\` — ${role}` : `\`${name}/\``;
}

function childDirs(node: FileTreeNode | undefined): FileTreeNode[] {
  return (node?.children ?? []).filter((c) => c.type === "directory" && !isNoisePath(c.name));
}

function findNode(tree: FileTreeNode | undefined, path: string): FileTreeNode | undefined {
  if (!tree) return undefined;
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    if (child.type === "directory" && (path === child.path || path.startsWith(child.path + "/"))) {
      return findNode(child, path);
    }
  }
  return undefined;
}

/**
 * The directory where a newcomer should look to understand how the code is
 * organized: the folder holding the top entry point if it has structure,
 * else the first conventional source folder with at least two modules.
 */
export function pickSourceRoot(tree: FileTreeNode | undefined, entryPoints: EntryPoint[]): FileTreeNode | undefined {
  const candidates: FileTreeNode[] = [];
  for (const ep of entryPoints.slice(0, 3)) {
    const parts = ep.file.split("/");
    // Walk up from the entry's folder (max 2 levels) to find structure
    for (let depth = parts.length - 1; depth >= Math.max(1, parts.length - 3); depth--) {
      const node = findNode(tree, parts.slice(0, depth).join("/"));
      if (node) candidates.push(node);
    }
  }
  for (const name of SOURCE_DIR_NAMES) {
    const node = tree?.children?.find((c) => c.type === "directory" && c.name === name);
    if (node) candidates.push(node);
    // One level of nesting covers backend/app, frontend/src, etc.
    for (const top of childDirs(tree)) {
      const nested = top.children?.find((c) => c.type === "directory" && c.name === name);
      if (nested) candidates.push(nested);
    }
  }
  return candidates.find((c) => childDirs(c).length >= 2);
}

export function generateTour(project: ProjectInfo): TourDefinition {
  const steps: TourStep[] = [];
  const name = projectName(project);
  const tree = project.fileTree;
  // Show tests/examples at the top level (useful landmarks), hide dot-folders.
  const topDirs = (tree?.children ?? []).filter((c) => c.type === "directory" && !c.name.startsWith("."));
  const topFiles = tree?.children?.filter((c) => c.type === "file") ?? [];
  const entryPoints: EntryPoint[] = (project as ProjectInfo & { _entryPoints?: EntryPoint[] })._entryPoints ?? [];
  const routes: Route[] = (project as ProjectInfo & { _routes?: Route[] })._routes ?? [];

  steps.push({
    id: "welcome",
    title: `Welcome to ${name}`,
    description: `This is **${name}**. We'll walk you through the architecture step by step so you understand how everything fits together.`,
    focusNodeIds: [],
  });

  if (topDirs.length > 0) {
    const shown = topDirs.slice(0, 8);
    const lines = shown.map((d) => `- ${describeDir(d.name)}`).join("\n");
    const more = topDirs.length > shown.length ? `\n- ...and ${topDirs.length - shown.length} more` : "";
    steps.push({
      id: "project-structure",
      title: "Project Structure",
      description: `The top level has **${topDirs.length} main ${topDirs.length === 1 ? "directory" : "directories"}**:\n\n${lines}${more}`,
      focusNodeIds: topDirs.map((d) => d.path),
    });
  }

  if (entryPoints.length > 0) {
    const epDirs = new Set<string>();
    for (const ep of entryPoints.slice(0, 5)) {
      const topDir = ep.file.split("/")[0];
      if (topDirs.some((d) => d.name === topDir)) epDirs.add(topDir);
    }
    const lines = entryPoints.slice(0, 5).map((ep) => {
      const route = ep.route ? ` (serves \`${ep.route}\`)` : "";
      return `- **${ep.file}** — ${ep.type}${route}`;
    });
    const more = entryPoints.length > 5 ? `\n- ...and ${entryPoints.length - 5} more` : "";
    steps.push({
      id: "entry-points",
      title: "Where execution starts",
      description: `Start reading here — these files are where the program begins:\n\n${lines.join("\n")}${more}`,
      focusNodeIds: [...epDirs],
    });
  }

  const realRoutes = routes.filter((r) => !isNoisePath(r.file));
  if (realRoutes.length > 0) {
    const isApi = (r: Route) => /(^|\/)route\.[jt]sx?$/.test(r.file) || r.file.split("/").includes("api") || r.method !== "GET";
    const pages = realRoutes.filter((r) => !isApi(r));
    const apis = realRoutes.filter(isApi);
    const routeDirs = new Set<string>();
    for (const r of realRoutes) {
      const topDir = r.file.split("/")[0];
      if (topDirs.some((d) => d.name === topDir)) routeDirs.add(topDir);
    }
    const list = (rs: Route[], fmt: (r: Route) => string) =>
      rs.slice(0, 5).map((r) => `- \`${fmt(r)}\``).join("\n") + (rs.length > 5 ? `\n- ...and ${rs.length - 5} more` : "");
    const parts: string[] = [];
    if (pages.length > 0) parts.push(`**${pages.length} page${pages.length === 1 ? "" : "s"}**:\n${list(pages, (r) => r.path)}`);
    if (apis.length > 0) parts.push(`**${apis.length} API endpoint${apis.length === 1 ? "" : "s"}**:\n${list(apis, (r) => `${r.method} ${r.path}`)}`);
    steps.push({
      id: "routes",
      title: "Routes",
      description: `How this app is addressed from the outside:\n\n${parts.join("\n\n")}`,
      focusNodeIds: [...routeDirs],
    });
  }

  const sourceRoot = pickSourceRoot(tree, entryPoints);
  if (sourceRoot) {
    const modules = childDirs(sourceRoot).slice(0, 8);
    steps.push({
      id: "source-modules",
      title: "How the code is organized",
      description: `Inside \`${sourceRoot.path}/\`, the code is split into:\n\n${modules.map((d) => `- ${describeDir(d.name)}`).join("\n")}`,
      focusNodeIds: modules.map((d) => d.path),
    });
  }

  const configFiles = topFiles.filter((c) => CONFIG_FILES.has(c.name) || /\.config\.[cm]?[jt]s$/.test(c.name));
  if (configFiles.length > 0) {
    steps.push({
      id: "configuration",
      title: "Configuration",
      description: `These root-level files control dependencies, build and tooling: ${configFiles.slice(0, 8).map((c) => `\`${c.name}\``).join(", ")}. Click any node to inspect it.`,
      focusNodeIds: configFiles.map((c) => c.path),
    });
  }

  steps.push({
    id: "summary",
    title: "You Made It!",
    description: `That's the architecture of **${name}**! You now have a mental model of how the project is structured. Explore freely — drag nodes, zoom in, click to inspect.`,
    focusNodeIds: topDirs.map((d) => d.path),
  });

  return { steps };
}
