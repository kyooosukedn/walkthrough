import { describe, it, expect } from "vitest";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { FileTreeAnalyzer } from "./file-tree.js";
import type { ProjectInfo } from "../types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "packages"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const MONOREPO_ROOT = findRoot(__dirname);
const SCANNER_SRC = resolve(__dirname, "../");

describe("FileTreeAnalyzer", () => {
  const analyzer = new FileTreeAnalyzer();

  it("always detects (returns true)", () => {
    expect(analyzer.detect({ rootPath: "/any/path" })).toBe(true);
  });

  it("scans the codemap project itself", async () => {
    const project: ProjectInfo = { rootPath: MONOREPO_ROOT };
    const result = await analyzer.analyze(project);

    expect(result.fileTree).toBeDefined();
    expect(result.fileTree.type).toBe("directory");
    expect(result.fileTree.children!.length).toBeGreaterThan(0);

    expect(result.stats.files).toBeGreaterThan(0);
    expect(result.stats.directories).toBeGreaterThan(0);

    const packages = result.fileTree.children!.find((c: { name: string }) => c.name === "packages");
    expect(packages).toBeDefined();
    expect(packages!.type).toBe("directory");

    const scanner = packages!.children!.find((c: { name: string }) => c.name === "scanner");
    expect(scanner).toBeDefined();

    const nodeModules = result.fileTree.children!.find((c: { name: string }) => c.name === "node_modules");
    expect(nodeModules).toBeUndefined();

    const git = result.fileTree.children!.find((c: { name: string }) => c.name === ".git");
    expect(git).toBeUndefined();
  });

  it("sorts directories before files", async () => {
    const project: ProjectInfo = { rootPath: MONOREPO_ROOT };
    const result = await analyzer.analyze(project);
    const packages = result.fileTree.children!.find((c: { name: string }) => c.name === "packages");

    if (packages?.children && packages.children.length > 1) {
      const firstFileIdx = packages.children.findIndex((c: { type: string }) => c.type === "file");
      const lastDirIdx = packages.children.findLastIndex((c: { type: string }) => c.type === "directory");

      if (firstFileIdx !== -1 && lastDirIdx !== -1) {
        expect(lastDirIdx).toBeLessThan(firstFileIdx);
      }
    }
  });

  it("marks files with extensions and sizes", async () => {
    const project: ProjectInfo = { rootPath: SCANNER_SRC };
    const result = await analyzer.analyze(project);
    const typesFile = result.fileTree.children!.find((c: { name: string }) => c.name === "types.ts");

    expect(typesFile).toBeDefined();
    expect(typesFile!.extension).toBe(".ts");
    expect(typesFile!.type).toBe("file");
    expect(typesFile!.size).toBeGreaterThan(0);
  });

  it("preserves file, directory, and line totals across nested text and binary files", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "walkthrough-tree-count-"));
    try {
      await mkdir(join(rootPath, "src"));
      await writeFile(join(rootPath, "a.ts"), "one\ntwo");
      await writeFile(join(rootPath, "src", "b.py"), "a\nb\nc");
      await writeFile(join(rootPath, "src", "image.bin"), Buffer.from([0, 1, 2]));
      await writeFile(join(rootPath, ".git"), "gitdir: elsewhere");
      const result = await analyzer.analyze({ rootPath });
      expect(result.stats).toEqual({ files: 3, directories: 2, totalLines: 5 });
      expect(result.fileTree.children?.map((child) => child.name)).toEqual(["src", "a.ts"]);
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });
});
