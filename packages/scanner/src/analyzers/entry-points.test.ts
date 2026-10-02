import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EntryPointAnalyzer } from "./entry-points.js";

describe("EntryPointAnalyzer", () => {
  it("finds conventional Python, Go, and Rust starts", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "walkthrough-entry-"));
    try {
      await mkdir(join(rootPath, "cmd", "tool"), { recursive: true });
      await mkdir(join(rootPath, "src"), { recursive: true });
      await mkdir(join(rootPath, "views"), { recursive: true });
      await writeFile(join(rootPath, "main.py"), "");
      await writeFile(join(rootPath, "cmd", "tool", "main.go"), "");
      await writeFile(join(rootPath, "src", "main.rs"), "");
      await writeFile(join(rootPath, "views", "layout.ts"), "");
      const output = await new EntryPointAnalyzer().analyze({ rootPath });
      expect(output.entryPoints.map((entry) => entry.file)).toEqual(expect.arrayContaining(["main.py", "cmd/tool/main.go", "src/main.rs"]));
      expect(output.entryPoints.map((entry) => entry.file)).not.toContain("views/layout.ts");
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });
});
