import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DatabaseAnalyzer } from "./database.js";
import type { FileTreeNode } from "../types.js";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "walkthrough-db-"));
}

function treeWith(children: FileTreeNode[]): FileTreeNode {
  return { name: "root", path: ".", type: "directory", children };
}

function dir(name: string, path: string, children: FileTreeNode[] = []): FileTreeNode {
  return { name, path, type: "directory", children };
}

function sqlFile(name: string, path: string): FileTreeNode {
  return { name, path, type: "file" };
}

describe("DatabaseAnalyzer", () => {
  it("parses SQL migrations: tables, columns, FK constraints, has_many reverse relations", async () => {
    const root = await tempProject();
    try {
      await mkdir(join(root, "supabase/migrations"), { recursive: true });
      await writeFile(
        join(root, "supabase/migrations", "20260101000000_init.sql"),
        `CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  body text
);

ALTER TABLE notes ADD CONSTRAINT notes_title_fk FOREIGN KEY (title_id) REFERENCES titles(id);
`,
      );

      const tree = treeWith([
        dir("supabase", "supabase", [
          dir("migrations", "supabase/migrations", [
            sqlFile("20260101000000_init.sql", "supabase/migrations/20260101000000_init.sql"),
          ]),
        ]),
      ]);

      const out = await new DatabaseAnalyzer().analyze({ rootPath: root, fileTree: tree });
      const db = out.database!;
      const names = db.tables.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(["users", "notes"]));

      const users = db.tables.find((t) => t.name === "users")!;
      expect(users.columns.find((c) => c.name === "email")?.nullable).toBe(false);
      expect(users.columns.find((c) => c.name === "id")?.primary).toBe(true);

      const notes = db.tables.find((t) => t.name === "notes")!;
      const userId = notes.columns.find((c) => c.name === "user_id")!;
      expect(userId.foreignKey).toEqual({ table: "users", column: "id" });

      // Reverse relation derived on users
      expect(users.relations).toContainEqual({ to: "notes", type: "has_many" });
      expect(db.migrations?.[0].tablesCreated.sort()).toEqual(["notes", "users"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("parses Prisma models with relation fields", async () => {
    const root = await tempProject();
    try {
      await mkdir(join(root, "prisma"), { recursive: true });
      await writeFile(
        join(root, "prisma", "schema.prisma"),
        `model Post {
  id        String   @id @default(cuid())
  title     String
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
}

model User {
  id    String @id @default(cuid())
  email String @unique
  posts Post[]
}
`,
      );

      const tree = treeWith([dir("prisma", "prisma", [
        { name: "schema.prisma", path: "prisma/schema.prisma", type: "file" },
      ])]);

      const out = await new DatabaseAnalyzer().analyze({ rootPath: root, fileTree: tree });
      const post = out.database!.tables.find((t) => t.name === "Post")!;
      expect(post.columns.find((c) => c.name === "authorId")?.foreignKey).toEqual({ table: "User", column: "id" });
      expect(post.relations).toContainEqual({ to: "User", type: "belongs_to" });

      const user = out.database!.tables.find((t) => t.name === "User")!;
      expect(user.relations).toContainEqual({ to: "Post", type: "has_many" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
