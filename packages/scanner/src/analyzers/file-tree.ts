import { extname, join, relative, basename } from "node:path";
import { readdir, stat, readFile } from "node:fs/promises";

import type { FileTreeNode, ProjectInfo, Analyzer, CodeMapStats } from "../types.js";
import { mapBounded, SCANNER_READ_CONCURRENCY } from "./ordered-map.js";

/** Directories to always skip */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  "__pycache__",
]);

/** Files to always skip */
const IGNORE_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

/**
 * FileTreeAnalyzer — always runs. Walks the project directory
 * and produces a FileTreeNode tree.
 */
export class FileTreeAnalyzer implements Analyzer {
  name = "file-tree";

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ fileTree: FileTreeNode; stats: CodeMapStats }> {
    const tree = await walkDir(project.rootPath, project.rootPath);
    const stats = await countNodes(project.rootPath, tree);
    return { fileTree: tree, stats };
  }
}

/** Recursively walk a directory and build the tree */
async function walkDir(rootPath: string, currentPath: string): Promise<FileTreeNode> {
  const name = basename(currentPath);
  // The contract is forward-slash paths on every platform — downstream
  // analyzers and the import graph key on them.
  const relPath = (relative(rootPath, currentPath) || ".").replace(/\\/g, "/");
  const s = await stat(currentPath);

  if (!s.isDirectory()) {
    return { name, path: relPath, type: "file", size: s.size, extension: extname(name) || undefined };
  }
  const entries = await readdir(currentPath, { withFileTypes: true });
  const children: FileTreeNode[] = [];

  for (const entry of entries) {
    // Linked Git worktrees use a .git file instead of a .git directory.
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.isFile() && IGNORE_FILES.has(entry.name)) continue;

    try {
      children.push(await walkDir(rootPath, join(currentPath, entry.name)));
    } catch {
      // Skip unreadable entries (permissions, broken symlinks)
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { name, path: relPath, type: "directory", children };
}

/** Count files, directories, and total lines in the tree */
async function countNodes(rootPath: string, tree: FileTreeNode): Promise<CodeMapStats> {
  let files = 0;
  let directories = 0;
  const textFiles: string[] = [];

  const TEXT_EXTS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".css", ".scss", ".less", ".html",
    ".json", ".yaml", ".yml", ".toml",
    ".md", ".txt", ".env",
    ".py", ".rb", ".go", ".rs", ".java",
    ".sql", ".graphql", ".prisma",
  ]);

  function walk(node: FileTreeNode): void {
    if (node.type === "file") {
      files++;
      const ext = node.extension?.toLowerCase() ?? "";
      if (TEXT_EXTS.has(ext)) textFiles.push(node.path);
    } else {
      directories++;
      for (const child of node.children ?? []) walk(child);
    }
  }

  walk(tree);
  const counts = await mapBounded(textFiles, SCANNER_READ_CONCURRENCY, async (path) => {
    try {
      const content = await readFile(join(rootPath, path), "utf-8");
      return content.split("\n").length;
    } catch {
      // Binary or unreadable — skip.
      return 0;
    }
  });
  const totalLines = counts.reduce((sum, count) => sum + count, 0);

  return { files, directories, totalLines };
}
