import type { FileTreeNode, RepoOrientation } from "../types.js";

const MANIFESTS = new Set([
  "package.json", "pyproject.toml", "requirements.txt", "pipfile", "poetry.lock",
  "go.mod", "cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts",
  "gemfile", "composer.json", "makefile", "cmakelists.txt", "mix.exs",
]);
const SOURCE_DIRS = new Set(["src", "source", "app", "apps", "lib", "cmd", "pkg", "internal", "packages", "backend", "frontend", "server", "client"]);
const TEST_DIRS = new Set(["test", "tests", "__tests__", "spec", "specs"]);
const MAX_ITEMS = 8;

/** Classify paths already present in the file tree. No source reads or execution. */
export function deriveOrientation(tree: FileTreeNode): RepoOrientation {
  const result: RepoOrientation = { docs: [], manifests: [], tests: [], sourceRoots: [] };
  let rootHasFile = false;

  function visit(node: FileTreeNode, inTests: boolean): void {
    const name = node.name.toLowerCase();
    if (node.type === "directory") {
      if (node.path !== "." && node.path.split("/").length === 1 && SOURCE_DIRS.has(name)) {
        result.sourceRoots.push(node.path);
      }
      for (const child of node.children ?? []) visit(child, inTests || TEST_DIRS.has(name));
      return;
    }

    if (!node.path.includes("/")) rootHasFile = true;
    const isDoc = /^(readme|contributing|architecture|getting-started|quickstart)(\.|$)/i.test(node.name)
      || node.path.toLowerCase().startsWith("docs/") && /\.(md|mdx|rst|txt)$/i.test(node.name);
    if (isDoc) result.docs.push(node.path);
    if (MANIFESTS.has(name)) result.manifests.push(node.path);
    if (inTests || /(^test[_-]|[._-](test|spec)\.)/i.test(node.name)) result.tests.push(node.path);
  }

  visit(tree, false);
  if (result.sourceRoots.length === 0 && rootHasFile) result.sourceRoots.push(".");
  for (const key of Object.keys(result) as (keyof RepoOrientation)[]) {
    result[key] = result[key].sort((a, b) => {
      if (key === "docs") {
        const rank = (path: string) => {
          const lower = path.toLowerCase();
          return lower.startsWith("readme") ? 0 : lower.startsWith("contributing") ? 1 : lower.startsWith("architecture") ? 2 : lower.includes("/") ? 4 : 3;
        };
        const difference = rank(a) - rank(b);
        if (difference) return difference;
      }
      return a.localeCompare(b);
    }).slice(0, MAX_ITEMS);
  }
  return result;
}
