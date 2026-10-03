import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImportGraph } from "@walkthrough/scanner";
import { buildEvidence } from "./context.js";
import { SourceError } from "../source.js";

async function withRepo(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "walkthrough-evidence-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("selected TypeScript file leads to direct imports, callers, test, and README", async () => {
  await withRepo(async (root) => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "form.ts"), "import { save } from './api'\nsave()\n");
    await writeFile(join(root, "src", "api.ts"), "export const save = () => 1\n");
    await writeFile(join(root, "src", "page.ts"), "import './form'\n");
    await writeFile(join(root, "src", "form.test.ts"), "test('form', () => {})\n");
    await writeFile(join(root, "README.md"), "# Example\n");
    const allowed = new Set(["src/form.ts", "src/api.ts", "src/page.ts", "src/form.test.ts", "README.md"]);
    const imports: ImportGraph = {
      nodes: [],
      edges: [
        { from: "src/form.ts", to: "src/api.ts", imports: ["./api"] },
        { from: "src/page.ts", to: "src/form.ts", imports: ["./form"] },
      ],
    };

    const bundle = await buildEvidence(root, "src/form.ts", allowed, imports);
    assert.deepEqual(bundle.files.map((file) => file.path), [
      "src/form.ts", "src/api.ts", "src/page.ts", "src/form.test.ts", "README.md",
    ]);
    assert.equal(bundle.files[0].lineCount, 3);
  });
});

test("Python file still receives selected source and a same-stem test without import edges", async () => {
  await withRepo(async (root) => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "main.py"), "def run():\n    return 1\n");
    await writeFile(join(root, "src", "main.test.py"), "def test_run(): pass\n");
    const allowed = new Set(["src/main.py", "src/main.test.py"]);
    const bundle = await buildEvidence(root, "src/main.py", allowed, undefined);
    assert.deepEqual(bundle.files.map((file) => file.path), ["src/main.py", "src/main.test.py"]);
    assert.ok(bundle.files.every((file) => allowed.has(file.path)));
  });
});

test("evidence never exceeds the source character budget", async () => {
  await withRepo(async (root) => {
    await writeFile(join(root, "big.py"), "x = 1\n".repeat(12_000));
    const bundle = await buildEvidence(root, "big.py", new Set(["big.py"]), undefined);
    assert.ok(bundle.files[0].content.length > 0);
    assert.ok(bundle.files.reduce((sum, file) => sum + file.content.length, 0) <= 48_000);
    assert.ok(bundle.files.length <= 6);
  });
});

test("secret paths and private-key contents are refused", async () => {
  await withRepo(async (root) => {
    await writeFile(join(root, ".env"), "API_KEY=secret\n");
    await writeFile(join(root, "id_rsa"), "-----BEGIN PRIVATE KEY-----\nsecret\n");
    await writeFile(join(root, "main.py"), "-----BEGIN PRIVATE KEY-----\nsecret\n");
    const allowed = new Set([".env", "id_rsa", "main.py"]);
    for (const path of allowed) {
      await assert.rejects(buildEvidence(root, path, allowed, undefined), SourceError);
    }
  });
});

test("unscanned and symlink-escape paths are refused by the contained source reader", async () => {
  await withRepo(async (root) => {
    await writeFile(join(root, "main.py"), "print('ok')\n");
    await assert.rejects(buildEvidence(root, "missing.py", new Set(["main.py"]), undefined), SourceError);
    const outside = await mkdtemp(join(tmpdir(), "walkthrough-outside-"));
    try {
      await writeFile(join(outside, "private.py"), "secret\n");
      try {
        await symlink(join(outside, "private.py"), join(root, "link.py"));
        await assert.rejects(buildEvidence(root, "link.py", new Set(["link.py"]), undefined), SourceError);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      }
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
