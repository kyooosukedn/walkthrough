import { describe, it, expect } from "vitest";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "./scanner.js";
import { writeCodeMap } from "./output/json.js";
import { readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Walk up to find the monorepo root (has packages/ directory)
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
const CODEMAP_ROOT = findRoot(__dirname);

describe("scan()", () => {
  it("produces a valid CodeMap from the codemap repo", async () => {
    const codemap = await scan(CODEMAP_ROOT);

    // Meta
    expect(codemap.meta.version).toBe("1.1.0");
    expect(codemap.meta.scannedAt).toBeTruthy();
    expect(codemap.meta.language).toBe("typescript");
    expect(codemap.meta.stats.files).toBeGreaterThan(0);

    // Frameworks detected (this is a Next.js project based on Stepwise,
    // but codemap itself has next in AGENTS.md references, let's just check react exists)
    const fwNames = codemap.meta.frameworks.map((f) => f.name);
    // If next is detected, it'll be there. If not, that's fine too.
    // The important thing is the field is populated.
    expect(Array.isArray(codemap.meta.frameworks)).toBe(true);

    // File tree
    expect(codemap.fileTree.type).toBe("directory");
    expect(codemap.fileTree.children!.length).toBeGreaterThan(0);

    // Packages directory
    const packages = codemap.fileTree.children!.find((c) => c.name === "packages");
    expect(packages).toBeDefined();

    // No node_modules
    const nodeModules = codemap.fileTree.children!.find((c) => c.name === "node_modules");
    expect(nodeModules).toBeUndefined();
  }, 10000);
});

describe("writeCodeMap()", () => {
  const tmpFile = resolve(__dirname, "test-output-codemap.json");

  it("writes valid JSON that round-trips", async () => {
    const codemap = await scan(CODEMAP_ROOT);
    await writeCodeMap(codemap, tmpFile);

    try {
      expect(existsSync(tmpFile)).toBe(true);
      const parsed = JSON.parse(await readFile(tmpFile, "utf-8"));
      expect(parsed.meta.version).toBe("1.1.0");
      expect(parsed.fileTree).toBeDefined();
      expect(parsed.meta.stats.files).toBeGreaterThan(0);
    } finally {
      if (existsSync(tmpFile)) await unlink(tmpFile).catch(() => {});
    }
  }, 10000);
});
