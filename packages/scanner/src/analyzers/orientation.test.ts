import { describe, expect, it } from "vitest";
import { deriveOrientation } from "./orientation.js";
import type { FileTreeNode } from "../types.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scan } from "../scanner.js";

const file = (path: string): FileTreeNode => ({ name: path.split("/").at(-1)!, path, type: "file" });
const dir = (path: string, children: FileTreeNode[]): FileTreeNode => ({
  name: path.split("/").at(-1)!, path, type: "directory", children,
});

describe("deriveOrientation", () => {
  it("finds source-backed paths in a TypeScript repo", () => {
    const tree = dir(".", [file("README.md"), file("package.json"), dir("src", [file("src/index.ts")]), dir("tests", [file("tests/index.test.ts")])]);
    expect(deriveOrientation(tree)).toEqual({
      docs: ["README.md"], manifests: ["package.json"], tests: ["tests/index.test.ts"], sourceRoots: ["src"],
    });
  });

  it("works for Python, Go, and mixed repos without parser support", () => {
    const python = dir(".", [file("pyproject.toml"), dir("app", [file("app/main.py")]), dir("tests", [file("tests/test_main.py")])]);
    const go = dir(".", [file("go.mod"), dir("cmd", [file("cmd/main.go")])]);
    const mixed = dir(".", [file("CONTRIBUTING.md"), file("Makefile"), dir("source", [file("source/main.xyz")])]);
    expect(deriveOrientation(python).sourceRoots).toEqual(["app"]);
    expect(deriveOrientation(python).tests).toEqual(["tests/test_main.py"]);
    expect(deriveOrientation(go).manifests).toEqual(["go.mod"]);
    expect(deriveOrientation(go).sourceRoots).toEqual(["cmd"]);
    expect(deriveOrientation(mixed).docs).toEqual(["CONTRIBUTING.md"]);
    expect(deriveOrientation(mixed).sourceRoots).toEqual(["source"]);
  });

  it("falls back to root and stays empty for an empty repo", () => {
    expect(deriveOrientation(dir(".", [file("main.unknown")])).sourceRoots).toEqual(["."]);
    expect(deriveOrientation(dir(".", []))).toEqual({ docs: [], manifests: [], tests: [], sourceRoots: [] });
  });

  it("puts root README ahead of nested docs", () => {
    const tree = dir(".", [dir("docs", [file("docs/guide.md")]), file("README.md"), file("ARCHITECTURE.md")]);
    expect(deriveOrientation(tree).docs).toEqual(["README.md", "ARCHITECTURE.md", "docs/guide.md"]);
  });

  it("does not list design documents in a specs directory as tests", () => {
    const tree = dir(".", [dir("docs", [dir("docs/superpowers", [dir("docs/superpowers/specs", [file("docs/superpowers/specs/journey-design.md")])])])]);
    const orientation = deriveOrientation(tree);
    expect(orientation.docs).toContain("docs/superpowers/specs/journey-design.md");
    expect(orientation.tests).toEqual([]);
  });
});

describe("scan orientation across languages", () => {
  it.each([
    ["python", "pyproject.toml", "app/main.py"],
    ["go", "go.mod", "cmd/main.go"],
    ["mixed", "Makefile", "source/main.xyz"],
  ])("%s checkout has usable structure", async (_kind, manifest, source) => {
    const rootPath = await mkdtemp(join(tmpdir(), "walkthrough-orient-"));
    try {
      await mkdir(join(rootPath, source.split("/")[0]));
      await writeFile(join(rootPath, manifest), "");
      await writeFile(join(rootPath, source), "");
      await writeFile(join(rootPath, "README.md"), "Start here\n");
      const map = await scan(rootPath);
      expect(map.orientation?.docs).toContain("README.md");
      expect(map.orientation?.manifests).toContain(manifest);
      expect(map.orientation?.sourceRoots).toContain(source.split("/")[0]);
      expect(map.fileTree.children?.length).toBeGreaterThan(0);
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });
});
