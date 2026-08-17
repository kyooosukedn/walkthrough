import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
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
});
