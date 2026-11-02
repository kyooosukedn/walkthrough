import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scan } from "../scanner.js";

describe("dependency and cache folders", () => {
  it("skips virtualenvs (by name or pyvenv.cfg), vendor/, target/ and symlink loops", async () => {
    const root = await mkdtemp(join(tmpdir(), "wt-ignore-"));
    try {
      await writeFile(join(root, "main.py"), "import app\n");
      await mkdir(join(root, "app"));
      await writeFile(join(root, "app", "__init__.py"), "");
      for (const dep of [".venv/lib", "myenv/lib", "vendor/x", "target/debug"]) {
        await mkdir(join(root, dep), { recursive: true });
        await writeFile(join(root, dep, "dep.py"), "import os\n");
      }
      await writeFile(join(root, "myenv", "pyvenv.cfg"), "home = /usr/bin\n");
      await symlink("..", join(root, "app", "loop"));

      const map = await scan(root);
      const paths = JSON.stringify(map.fileTree);
      expect(paths).toContain("main.py");
      for (const hidden of [".venv", "myenv", "vendor", "target", "loop"]) expect(paths).not.toContain(hidden);
      expect(map.imports?.edges.map((e) => e.to)).toEqual(["app/__init__.py"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
