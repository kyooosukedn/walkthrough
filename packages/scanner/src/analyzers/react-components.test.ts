import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReactComponentAnalyzer } from "./react-components.js";
import type { FileTreeNode } from "../types.js";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "walkthrough-components-"));
}

describe("ReactComponentAnalyzer", () => {
  it("extracts PascalCase exports, pages, and component-to-component imports", async () => {
    const root = await tempProject();
    try {
      await mkdir(join(root, "app"), { recursive: true });
      await mkdir(join(root, "components"), { recursive: true });
      await writeFile(
        join(root, "app", "page.tsx"),
        `import { Button } from "../components/button";
export default function Home() { return <Button />; }
`,
      );
      await writeFile(
        join(root, "components", "button.tsx"),
        `export function Button({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick}>{label}</button>;
}
export const ButtonGroup = () => null;
`,
      );

      const tree: FileTreeNode = {
        name: "root",
        path: ".",
        type: "directory",
        children: [
          { name: "page.tsx", path: "app/page.tsx", type: "file" },
          { name: "button.tsx", path: "components/button.tsx", type: "file" },
        ],
      };

      const out = await new ReactComponentAnalyzer().analyze({
        rootPath: root,
        fileTree: tree,
        _imports: {
          nodes: [],
          edges: [{ from: "app/page.tsx", to: "components/button.tsx", imports: ["../components/button"] }],
        },
      } as never);

      const names = (file: string) => out.components?.filter((c) => c.file === file).map((c) => c.name) ?? [];
      expect(names("app/page.tsx")).toContain("Home");
      expect(names("components/button.tsx")).toEqual(expect.arrayContaining(["Button", "ButtonGroup"]));

      const home = out.components?.find((c) => c.name === "Home");
      expect(home?.isPage).toBe(true);
      expect(home?.imports).toContain("components/button.tsx");

      const button = out.components?.find((c) => c.name === "Button");
      expect(button?.isPage).toBe(false);
      expect(button?.props).toEqual(expect.arrayContaining(["label", "onClick"]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores lowercase exports", async () => {
    const root = await tempProject();
    try {
      await mkdir(join(root, "lib"), { recursive: true });
      await writeFile(
        join(root, "lib", "utils.tsx"),
        `export const helper = () => 1;
export function useThing() { return 1; }
`,
      );

      const tree: FileTreeNode = {
        name: "root",
        path: ".",
        type: "directory",
        children: [{ name: "utils.tsx", path: "lib/utils.tsx", type: "file" }],
      };

      const out = await new ReactComponentAnalyzer().analyze({ rootPath: root, fileTree: tree });
      expect(out.components ?? []).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
