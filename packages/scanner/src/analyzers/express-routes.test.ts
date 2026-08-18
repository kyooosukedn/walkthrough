import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ExpressRoutesAnalyzer } from "./express-routes.js";
import type { FileTreeNode } from "../types.js";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "walkthrough-express-"));
}

describe("ExpressRoutesAnalyzer", () => {
  it("extracts app and router method routes with paths", async () => {
    const root = await tempProject();
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, "src", "server.ts"),
        `import express from "express";
const app = express();
const router = express.Router();

app.get("/health", (req, res) => res.json({ ok: true }));
app.post("/api/users", createUser);
router.delete("/api/users/:id", removeUser);
router.patch("/api/users/:id", updateUser);
`,
      );
      await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { express: "^4.19.0" } }));

      const tree: FileTreeNode = {
        name: "root",
        path: ".",
        type: "directory",
        children: [
          { name: "server.ts", path: "src/server.ts", type: "file" },
        ],
      };

      const out = await new ExpressRoutesAnalyzer().analyze({
        rootPath: root,
        fileTree: tree,
        packageJson: { dependencies: { express: "^4.19.0" } },
      });

      const paths = out.routes?.map((r) => `${r.method} ${r.path}`) ?? [];
      expect(paths).toContain("GET /health");
      expect(paths).toContain("POST /api/users");
      expect(paths).toContain("DELETE /api/users/:id");
      expect(paths).toContain("PATCH /api/users/:id");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detect() requires the express dependency", () => {
    const analyzer = new ExpressRoutesAnalyzer();
    expect(analyzer.detect({ rootPath: ".", packageJson: { dependencies: { express: "4" } } })).toBe(true);
    expect(analyzer.detect({ rootPath: ".", packageJson: { dependencies: { fastify: "4" } } })).toBe(false);
    expect(analyzer.detect({ rootPath: "." })).toBe(false);
  });
});
