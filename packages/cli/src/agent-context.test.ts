import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dirname, "index.js");

async function withRepo(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "walkthrough-agent-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "# Example repo\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");
    await writeFile(join(root, "src", "main.ts"), "import { answer } from './helper'\nexport const run = () => answer\n");
    await writeFile(join(root, "src", "helper.ts"), "export const answer = 42\n");
    await writeFile(join(root, "src", "caller.ts"), "import { run } from './main'\nrun()\n");
    await writeFile(join(root, "src", "main.test.ts"), "import { run } from './main'\nconsole.log(run())\n");
    await writeFile(join(root, "src", "private-key.ts"), "export const token = 'do not show'\n");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function context(root: string, selected: string) {
  return spawnSync(process.execPath, [cli, root, "--lesson-context", selected, "--no-serve"], {
    encoding: "utf8",
    env: { ...process.env, DEEPSEEK_API_KEY: "" },
    timeout: 10_000,
  });
}

test("lesson context is clean, bounded JSON with source and static relationship hints", async () => {
  await withRepo(async (root) => {
    const result = context(root, "src/main.ts");
    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.schemaVersion, 1);
    assert.equal(packet.selectedPath, "src/main.ts");
    assert.equal(packet.repo.language, "typescript");
    assert.deepEqual(packet.relationships.dependencies, ["src/helper.ts"]);
    assert.ok(packet.relationships.importers.includes("src/caller.ts"));
    assert.deepEqual(packet.files.map((file: { path: string }) => file.path).slice(0, 2), ["src/main.ts", "src/helper.ts"]);
    assert.match(packet.files[0].content, /export const run/);
    assert.equal(packet.files[0].truncated, false);
    assert.ok(packet.files.some((file: { path: string }) => file.path === "README.md"));
    assert.equal(packet.limits.maxSourceCharacters, 48_000);
    assert.ok(!result.stdout.includes("◆ Walkthrough"));
  });
});

test("lesson context rejects sensitive and unscanned paths without printing their content", async () => {
  await withRepo(async (root) => {
    for (const path of ["src/private-key.ts", "../outside.ts"]) {
      const result = context(root, path);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.ok(!result.stderr.includes("do not show"));
    }
  });
});

test("lesson context requires a file path and works for a Python checkout", async () => {
  await withRepo(async (root) => {
    await rm(join(root, "tsconfig.json"));
    await writeFile(join(root, "pyproject.toml"), "[project]\nname = 'example'\n");
    await writeFile(join(root, "src", "worker.py"), "def work():\n    return 42\n");
    await writeFile(join(root, "src", "worker.test.py"), "def test_work(): pass\n");
    const missing = spawnSync(process.execPath, [cli, root, "--lesson-context"], { encoding: "utf8", timeout: 10_000 });
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout, "");
    const result = context(root, "src/worker.py");
    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.repo.language, "python");
    assert.deepEqual(packet.files.map((file: { path: string }) => file.path).slice(0, 2), ["src/worker.py", "src/worker.test.py"]);
  });
});
