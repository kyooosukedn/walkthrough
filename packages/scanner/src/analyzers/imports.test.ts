import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ImportGraphAnalyzer } from "./imports.js";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "walkthrough-imports-"));
}

describe("ImportGraphAnalyzer", () => {
  it("resolves tsconfig path aliases, including in commented tsconfigs", async () => {
    const root = await tempProject();
    try {
      // Commented JSONC with glob-y string values — a naive comment-strip
      // regex would eat `"@/*"` and corrupt the parse.
      await writeFile(
        join(root, "tsconfig.json"),
        `{
  // compiler options
  "compilerOptions": {
    /* baseUrl intentionally omitted — defaults to "." */
    "paths": {
      "@/*": ["./*"]
    }
  },
  "exclude": ["node_modules", "@*.ts"]
}
`,
      );
      await mkdir(join(root, "components"), { recursive: true });
      await writeFile(join(root, "components", "nav.tsx"), "export const Nav = 1;\n");
      await writeFile(
        join(root, "page.tsx"),
        `import { Nav } from "@/components/nav";
export const Page = Nav;
`,
      );

      const out = await new ImportGraphAnalyzer().analyze({ rootPath: root });
      const edge = out.imports.edges.find((e) => e.from === "page.tsx");
      expect(edge?.to).toBe("components/nav.tsx");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("captures export-from and side-effect imports", async () => {
    const root = await tempProject();
    try {
      await writeFile(join(root, "util.ts"), "export const util = 1;\nexport const other = 2;\n");
      await writeFile(join(root, "polyfills.ts"), "globalThis.poly = true;\n");
      await writeFile(
        join(root, "main.ts"),
        `export { util } from "./util";
import "./polyfills";
`,
      );

      const out = await new ImportGraphAnalyzer().analyze({ rootPath: root });
      const targets = out.imports.edges.filter((e) => e.from === "main.ts").map((e) => e.to);
      expect(targets).toContain("util.ts");
      expect(targets).toContain("polyfills.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("bounds overlapping source reads and merges repeated imports in stable order", async () => {
    const root = await tempProject();
    try {
      await writeFile(join(root, "shared.ts"), "export const value = 1;");
      for (let i = 0; i < 24; i++) {
        const name = `entry${String(i).padStart(2, "0")}.ts`;
        await writeFile(join(root, name), `import { value } from "./shared";\nimport "./shared";\nexport const n = ${i};\n`);
      }
      let active = 0;
      let highest = 0;
      const readSource = async (path: string) => {
        active++;
        highest = Math.max(highest, active);
        await new Promise((done) => setTimeout(done, 5));
        const content = await readFile(path, "utf8");
        active--;
        return content;
      };
      const out = await new ImportGraphAnalyzer(readSource).analyze({ rootPath: root });
      expect(highest).toBeGreaterThan(1);
      expect(highest).toBeLessThanOrEqual(16);
      const edges = out.imports.edges.filter((edge) => edge.to === "shared.ts");
      expect(edges).toHaveLength(24);
      expect(edges[0]).toEqual({ from: "entry00.ts", to: "shared.ts", imports: ["./shared", "./shared"] });
      expect(edges.at(-1)?.from).toBe("entry23.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
