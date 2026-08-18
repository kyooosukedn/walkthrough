import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";

import type {
  DatabaseSchema,
  Table,
  Column,
  Relation,
  Migration,
  ProjectInfo,
  Analyzer,
  FileTreeNode,
  AnalyzerOutput,
} from "../types.js";

const SQL_MIGRATION_DIRS = ["supabase/migrations", "prisma/migrations", "migrations", "db/migrations", "drizzle"];

/**
 * Extracts the database schema:
 * - Prisma `schema.prisma` models (preferred when present)
 * - SQL migrations (CREATE TABLE / ALTER TABLE ADD COLUMN / FOREIGN KEY)
 *
 * Tables merge by name across migrations in filename order.
 */
export class DatabaseAnalyzer implements Analyzer {
  name = "database";

  detect(project: ProjectInfo): boolean {
    return findPrismaFile(project.fileTree) !== null || findSqlMigrations(project.fileTree).length > 0;
  }

  async analyze(project: ProjectInfo): Promise<AnalyzerOutput> {
    const prismaPath = findPrismaFile(project.fileTree);
    if (prismaPath) {
      const prisma = await readFile(join(project.rootPath, prismaPath), "utf-8");
      return { database: parsePrisma(prisma) };
    }

    const migrationFiles = findSqlMigrations(project.fileTree);
    const schema = await parseSqlMigrations(project.rootPath, migrationFiles);
    return { database: schema };
  }
}

// ─── Prisma ──────────────────────────────────────────────────

const PRISMA_MODEL_RE = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
const PRISMA_FIELD_RE = /^(\w+)\s+(\w+(?:\[\])?)(\?)?\s*(.*)$/;
const PRISMA_RELATION_FIELDS_RE = /@relation\(.*?fields:\s*\[(\w+)\].*?references:\s*\[(\w+)\].*?\)/;

function parsePrisma(source: string): DatabaseSchema {
  const tables = new Map<string, Table>();
  const tableFks = new Map<string, Map<string, { table: string; column: string }>>();

  PRISMA_MODEL_RE.lastIndex = 0;
  let modelMatch: RegExpExecArray | null;
  while ((modelMatch = PRISMA_MODEL_RE.exec(source)) !== null) {
    const name = modelMatch[1];
    const body = modelMatch[2];
    const table: Table = { name, columns: [], relations: [] };
    const fkColumns = new Map<string, { table: string; column: string }>();
    tableFks.set(name, fkColumns);

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const field = trimmed.match(PRISMA_FIELD_RE);
      if (!field) continue;
      const [, fieldName, fieldType, optional, attrs = ""] = field;
      if (fieldName === "id" && fieldType === "String" && attrs.includes("@default")) {
        // still a column; fall through
      }

      const isId = attrs.includes("@id") || attrs.includes("@@id");
      const relationAttr = attrs.match(PRISMA_RELATION_FIELDS_RE);
      if (relationAttr && isModelType(fieldType)) {
        // Relation field with explicit FK columns, e.g.
        //   author User @relation(fields: [authorId], references: [id])
        fkColumns.set(relationAttr[1], { table: fieldType, column: relationAttr[2] });
        table.relations.push({ to: fieldType, type: "belongs_to" });
        continue;
      }
      if (relationAttr === null && isModelType(fieldType) && !attrs.includes("@default")) {
        // Back-relation field (a list or single model type without FK columns here)
        table.relations.push({
          to: fieldType.replace(/\[\]$/, ""),
          type: fieldType.endsWith("[]") ? "has_many" : "has_one",
        });
        continue;
      }

      table.columns.push({
        name: fieldName,
        type: fieldType,
        nullable: optional === "?",
        primary: isId,
        foreignKey: fkColumns.get(fieldName),
      });
    }

    tables.set(name, table);
  }

  // Relation lines can follow their scalar columns; attach FKs after the loop.
  for (const table of tables.values()) {
    for (const [colName, fk] of tableFks.get(table.name) ?? []) {
      const column = table.columns.find((c) => c.name === colName);
      if (column) column.foreignKey = fk;
      else table.columns.push({ name: colName, type: "unknown", foreignKey: fk });
    }
  }

  return { tables: [...tables.values()], migrations: [] };
}

/** Prisma model types are uppercase; scalars (String, Int…) are not. */
function isModelType(type: string): boolean {
  return /^[A-Z]/.test(type) && !["String", "Int", "Float", "Boolean", "DateTime", "Json", "Bytes", "Decimal"].includes(type);
}

// ─── SQL migrations ──────────────────────────────────────────

async function parseSqlMigrations(rootPath: string, files: string[]): Promise<DatabaseSchema> {
  const tables = new Map<string, Table>();
  const migrations: Migration[] = [];

  for (const file of files) {
    let sql: string;
    try {
      sql = await readFile(join(rootPath, file), "utf-8");
    } catch {
      continue;
    }

    const created: string[] = [];
    const modified: string[] = [];

    for (const statement of splitStatements(sql)) {
      const create = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"'`\[]?([\w.]+)[\"'`\]]?\s*\(([\s\S]*)\)/i);
      if (create) {
        const name = create[1].split(".").pop()!;
        const table = parseCreateTable(name, create[2]);
        tables.set(name, table);
        created.push(name);
        continue;
      }

      const alterAdd = statement.match(/ALTER\s+TABLE\s+[\"'`\[]?([\w.]+)[\"'`\]]?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"'`\[]?(\w+)[\"'`\]]?\s+([\w()]+(?:\s*\([^)]*\))?)/i);
      if (alterAdd) {
        const name = alterAdd[1].split(".").pop()!;
        const table = tables.get(name) ?? { name, columns: [], relations: [] };
        const [, , colName, colType] = alterAdd;
        const fk = extractFkFromStatement(statement);
        table.columns.push({ name: colName, type: colType.split(" ")[0], nullable: /NOT\s+NULL/i.test(statement) === false, foreignKey: fk ?? undefined });
        tables.set(name, table);
        if (!modified.includes(name)) modified.push(name);
        continue;
      }

      const addFk = statement.match(/ALTER\s+TABLE\s+[\"'`\[]?(\w+)[\"'`\]]?\s+ADD\s+CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\(([\"\w\[\]]+)\)\s+REFERENCES\s+[\"'`\[]?(\w+)[\"'`\]]?\s*\(([\"\w\[\]]+)\)/i);
      if (addFk) {
        const table = tables.get(addFk[1]) ?? { name: addFk[1], columns: [], relations: [] };
        const fkCol = stripQuotes(addFk[2]);
        const column = table.columns.find((c) => c.name === fkCol);
        if (column) column.foreignKey = { table: addFk[3], column: stripQuotes(addFk[4]) };
        else table.columns.push({ name: fkCol, type: "unknown", foreignKey: { table: addFk[3], column: stripQuotes(addFk[4]) } });
        table.relations.push({ to: addFk[3], type: "belongs_to" });
        tables.set(addFk[1], table);
        if (!modified.includes(addFk[1])) modified.push(addFk[1]);
      }
    }

    migrations.push({
      file,
      timestamp: file.match(/^(\d{14})/)?.[1],
      tablesCreated: created,
      tablesModified: modified,
    });
  }

  // Derive reverse relations: referenced table gains has_many
  for (const table of tables.values()) {
    for (const column of table.columns) {
      if (column.foreignKey && !table.relations.some((r) => r.to === column.foreignKey!.table)) {
        table.relations.push({ to: column.foreignKey.table, type: "belongs_to" });
      }
      if (column.foreignKey) {
        tables.get(column.foreignKey.table)?.relations.push({ to: table.name, type: "has_many" });
      }
    }
  }

  return { tables: [...tables.values()], migrations };
}

function parseCreateTable(name: string, body: string): Table {
  const table: Table = { name, columns: [], relations: [] };
  const parts = splitColumnDefinitions(body);

  for (const part of parts) {
    const constraint = part.trim().match(/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CONSTRAINT|CHECK)\b/i);
    if (constraint) {
      const fk = part.trim().match(/FOREIGN\s+KEY\s*\(([\"\w\[\]]+)\)\s+REFERENCES\s+[\"'`\[]?(\w+)[\"'`\]]?\s*\(([\"\w\[\]]+)\)/i);
      if (fk) {
        const fkCol = stripQuotes(fk[1]);
        const column = table.columns.find((c) => c.name === fkCol);
        if (column) column.foreignKey = { table: fk[2], column: stripQuotes(fk[3]) };
      }
      continue;
    }

    const colMatch = part.trim().match(/^[\"'`\[]?(\w+)[\"'`\]]?\s+([\w]+(?:\s*\([^)]*\))?)/);
    if (!colMatch) continue;
    const [, colName, colType] = colMatch;
    const inlineFk = extractFkFromStatement(part);
    table.columns.push({
      name: colName,
      type: colType.replace(/\s*\(.*/, "").toLowerCase(),
      nullable: !/\bNOT\s+NULL\b/i.test(part),
      primary: /\bPRIMARY\s+KEY\b/i.test(part),
      foreignKey: inlineFk ?? undefined,
    });
    if (inlineFk) {
      table.relations.push({ to: inlineFk.table, type: "belongs_to" });
    }
  }

  return table;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^[^\w]+/, "").trim())
    .filter((s) => s.length > 0);
}

/** Split column definitions on commas at paren-depth zero. */
function splitColumnDefinitions(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inString: string | null = null;

  for (const ch of body) {
    if (inString) {
      current += ch;
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function extractFkFromStatement(statement: string): { table: string; column: string } | null {
  const fk = statement.match(/REFERENCES\s+[\"'`\[]?(\w+)[\"'`\]]?\s*\(([\"\w\[\]]+)\)/i);
  return fk ? { table: fk[1], column: stripQuotes(fk[2]) } : null;
}

function stripQuotes(value: string): string {
  return value.replace(/[\"'`\[\]]/g, "");
}

// ─── File discovery ──────────────────────────────────────────

function findPrismaFile(tree?: FileTreeNode): string | null {
  const prismaDir = findDir(tree, "prisma");
  return prismaDir?.children?.find((c) => c.type === "file" && c.name === "schema.prisma")?.path ?? null;
}

function findSqlMigrations(tree?: FileTreeNode): string[] {
  const out: string[] = [];
  for (const dirName of SQL_MIGRATION_DIRS) {
    const segments = dirName.split("/");
    let dir: FileTreeNode | undefined = tree;
    for (const segment of segments) {
      dir = findDir(dir, segment);
      if (!dir) break;
    }
    if (!dir) continue;
    for (const child of dir.children ?? []) {
      if (child.type === "file" && child.name.endsWith(".sql")) out.push(child.path);
    }
  }
  return out.sort();
}

function findDir(tree: FileTreeNode | undefined, name: string): FileTreeNode | undefined {
  return (tree?.children ?? []).find((c) => c.type === "directory" && c.name === name);
}
