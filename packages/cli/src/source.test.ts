import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSource, SourceError } from "./source.js";

test("readSource reads only allowed UTF-8 files inside checkout", async () => {
  const base = await mkdtemp(join(tmpdir(), "walkthrough-source-"));
  const root = join(base, "repo");
  try {
    await mkdir(root);
    await writeFile(join(root, "main.py"), "print('hello')\n");
    await writeFile(join(base, "secret.txt"), "secret");
    await writeFile(join(root, "binary.dat"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, "large.txt"), "x".repeat(513 * 1024));
    const allowed = new Set(["main.py", "binary.dat", "large.txt", "link.txt"]);
    assert.equal(await readSource(root, "main.py", allowed), "print('hello')\n");
    for (const path of ["../secret.txt", "/secret.txt", "C:/secret.txt", "not-scanned.txt", "missing.txt"]) {
      await assert.rejects(readSource(root, path, allowed), SourceError);
    }
    await assert.rejects(readSource(root, "binary.dat", allowed), SourceError);
    await assert.rejects(readSource(root, "large.txt", allowed), SourceError);
    try {
      await symlink(join(base, "secret.txt"), join(root, "link.txt"));
      await assert.rejects(readSource(root, "link.txt", allowed), SourceError);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
