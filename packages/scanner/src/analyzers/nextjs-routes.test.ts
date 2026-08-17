import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextJsRoutesAnalyzer } from "./nextjs-routes.js";
import type { FileTreeNode } from "../types.js";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "walkthrough-routes-"));
}

function dir(name: string, path: string, children: FileTreeNode[]): FileTreeNode {
  return { name, path, type: "directory", children };
}

function file(name: string, path: string): FileTreeNode {
  return { name, path, type: "file" };
}

describe("NextJsRoutesAnalyzer", () => {
  it("derives app-router routes: groups, dynamics, handlers with methods", async () => {
    const root = await tempProject();
    try {
      const tree = dir("root", ".", [
        dir("app", "app", [
          dir("(marketing)", "app/(marketing)", [
            file("page.tsx", "app/(marketing)/page.tsx"),
          ]),
          dir("blog", "app/blog", [
            dir("[slug]", "app/blog/[slug]", [
              file("page.tsx", "app/blog/[slug]/page.tsx"),
            ]),
          ]),
          dir("api", "app/api", [
            dir("health", "app/api/health", [
              file("route.ts", "app/api/health/route.ts"),
            ]),
          ]),
        ]),
      ]);

      await mkdir(join(root, "app/api/health"), { recursive: true });
      await writeFile(
        join(root, "app/api/health/route.ts"),
        "export async function GET() { return Response.json({ ok: true }); }\nexport async function POST(req: Request) { return Response.json(await req.json()); }\n",
      );

      const out = await new NextJsRoutesAnalyzer().analyze({
        rootPath: root,
        fileTree: tree,
      });

      const paths = out.routes?.map((r) => `${r.method} ${r.path}`) ?? [];
      expect(paths).toContain("GET /");
      expect(paths).toContain("GET /blog/:slug");
      expect(paths).toContain("GET /api/health");
      expect(paths).toContain("POST /api/health");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("derives pages-router routes and skips framework files", async () => {
    const tree = dir("root", ".", [
      dir("pages", "pages", [
        file("_app.tsx", "pages/_app.tsx"),
        file("about.tsx", "pages/about.tsx"),
        dir("api", "pages/api", [
          file("users.ts", "pages/api/users.ts"),
        ]),
      ]),
    ]);

    const out = await new NextJsRoutesAnalyzer().analyze({
      rootPath: ".",
      fileTree: tree,
    });

    const paths = out.routes?.map((r) => `${r.method} ${r.path}`) ?? [];
    expect(paths).toContain("GET /about");
    expect(paths).toContain("GET /api/users");
    expect(paths.some((p) => p.includes("_app"))).toBe(false);
  });

  it("attaches import-graph calls to routes", async () => {
    const tree = dir("root", ".", [
      dir("app", "app", [
        file("page.tsx", "app/page.tsx"),
      ]),
    ]);

    const out = await new NextJsRoutesAnalyzer().analyze({
      rootPath: ".",
      fileTree: tree,
      _imports: {
        nodes: [],
        edges: [{ from: "app/page.tsx", to: "lib/nav.ts", imports: ["@/lib/nav"] }],
      },
    } as never);

    expect(out.routes?.[0]?.calls).toContain("lib/nav.ts");
  });
});
