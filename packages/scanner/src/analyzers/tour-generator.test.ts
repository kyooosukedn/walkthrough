import { describe, it, expect } from "vitest";

import type { EntryPoint, FileTreeNode, ProjectInfo } from "../types.js";
import { generateTour, pickSourceRoot, projectName } from "./tour-generator.js";
import { rankEntryPoints } from "./entry-points.js";
import { toSourcePath } from "./workspaces.js";

function dir(path: string, children: FileTreeNode[] = []): FileTreeNode {
  return { name: path.split("/").pop() || path, path, type: "directory", children };
}
function file(path: string): FileTreeNode {
  return { name: path.split("/").pop()!, path, type: "file" };
}

const fastapiTree = dir("", [
  dir(".github", [dir(".github/workflows")]),
  dir(".vscode"),
  dir("backend", [
    dir("backend/app", [
      dir("backend/app/api"),
      dir("backend/app/core"),
      dir("backend/app/models"),
      file("backend/app/main.py"),
    ]),
    dir("backend/tests"),
  ]),
  dir("frontend", [dir("frontend/src", [dir("frontend/src/components"), file("frontend/src/main.tsx")])]),
  dir("packages", [dir("packages/react-email")]),
  file(".env"),
  file("pyproject.toml"),
  file("README.md"),
]);

describe("projectName", () => {
  it("uses package.json name when meaningful", () => {
    expect(projectName({ rootPath: "/x/repo", packageJson: { name: "express" } })).toBe("express");
  });
  it("falls back to the folder name for missing or generic names", () => {
    expect(projectName({ rootPath: "/x/gin" })).toBe("gin");
    expect(projectName({ rootPath: "/x/medusa", packageJson: { name: "root" } })).toBe("medusa");
    expect(projectName({ rootPath: "/x/ct3a", packageJson: { name: "@ct3a/root" } })).toBe("ct3a");
  });
});

describe("rankEntryPoints", () => {
  it("drops test, fixture and template entries when real ones exist", () => {
    const ranked = rankEntryPoints([
      { file: "test/app.js", type: "server" },
      { file: "src/__fixtures__/routers/route.ts", type: "server" },
      { file: "cli/template/src/server.ts", type: "server" },
      { file: "index.js", type: "server" },
    ]);
    expect(ranked.map((e) => e.file)).toEqual(["index.js"]);
  });
  it("keeps noisy entries if nothing else exists", () => {
    const ranked = rankEntryPoints([{ file: "examples/main.go", type: "cli" }]);
    expect(ranked).toHaveLength(1);
  });
  it("puts package.json-declared entries first, then shallower files", () => {
    const ranked = rankEntryPoints(
      [
        { file: "a/b/c/page.tsx", type: "page" },
        { file: "app/page.tsx", type: "page" },
        { file: "dist/cli.js", type: "cli" },
      ],
      new Set(["dist/cli.js"]),
    );
    expect(ranked.map((e) => e.file)).toEqual(["dist/cli.js", "app/page.tsx", "a/b/c/page.tsx"]);
  });
});

describe("pickSourceRoot", () => {
  it("follows the top entry point to the folder with real structure", () => {
    const eps: EntryPoint[] = [{ file: "backend/app/main.py", type: "server" }];
    expect(pickSourceRoot(fastapiTree, eps)?.path).toBe("backend/app");
  });
  it("falls back to conventional source folders", () => {
    const tree = dir("", [dir("src", [dir("src/a"), dir("src/b")])]);
    expect(pickSourceRoot(tree, [])?.path).toBe("src");
  });
});

describe("generateTour", () => {
  const project: ProjectInfo & { _entryPoints: EntryPoint[] } = {
    rootPath: "/x/full-stack-fastapi-template",
    fileTree: fastapiTree,
    _entryPoints: [
      { file: "backend/app/main.py", type: "server" },
      { file: "frontend/src/main.tsx", type: "server" },
    ],
  };
  const tour = generateTour(project);
  const step = (id: string) => tour.steps.find((s) => s.id === id);

  it("hides dot-folders from the structure step and explains known folders", () => {
    const s = step("project-structure")!;
    expect(s.focusNodeIds).toEqual(["backend", "frontend", "packages"]);
    expect(s.description).toContain("the backend service");
    expect(s.description).not.toContain(".github");
  });
  it("tours the real source modules, not a side package", () => {
    const s = step("source-modules")!;
    expect(s.focusNodeIds).toEqual(["backend/app/api", "backend/app/core", "backend/app/models"]);
  });
  it("explains how modules depend on each other", () => {
    const withImports = {
      ...project,
      _imports: {
        nodes: [],
        edges: [
          { from: "backend/app/api/routes.py", to: "backend/app/models/user.py", imports: ["x"] },
          { from: "backend/app/api/deps.py", to: "backend/app/models/item.py", imports: ["x"] },
          { from: "backend/app/api/deps.py", to: "backend/app/core/config.py", imports: ["x"] },
        ],
      },
    };
    const s = generateTour(withImports).steps.find((x) => x.id === "connections")!;
    expect(s.description).toContain("`api` uses `models` (2 imports)");
    expect(s.description).toContain("`api` uses `core` (1 import)");
  });
  it("never highlights .env in configuration", () => {
    const s = step("configuration")!;
    expect(s.focusNodeIds).toContain("pyproject.toml");
    expect(s.focusNodeIds).not.toContain(".env");
  });
});

describe("toSourcePath / root package.json entries", () => {
  const files = new Set(["bin/tool.js", "src/index.ts", "src/cli.ts"]);
  it("strips ./ and maps dist/ output back to src/", () => {
    expect(toSourcePath("", "./bin/tool.js", files, false)).toBe("bin/tool.js");
    expect(toSourcePath("", "dist/cli.js", files, false)).toBe("src/cli.ts");
  });
  it("never invents a bin entry that does not exist", () => {
    expect(toSourcePath("", "./dist/missing.js", files, false)).toBeUndefined();
  });
  it("has no leading slash for the repo root", () => {
    expect(toSourcePath("", undefined, files)).toBe("src/index.ts");
  });
});
