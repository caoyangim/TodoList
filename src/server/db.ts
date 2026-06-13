import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/todoflow.db";
const databasePath = databaseUrl.replace(/^file:/, "");
const absolutePath = path.resolve(process.cwd(), databasePath);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

const globalForDb = globalThis as unknown as { todoFlowDb?: Database.Database };

export const db = globalForDb.todoFlowDb ?? new Database(absolutePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS Todo (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH')),
    dueAt TEXT,
    completedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS Todo_completedAt_idx ON Todo(completedAt);
  CREATE INDEX IF NOT EXISTS Todo_dueAt_idx ON Todo(dueAt);

  CREATE TABLE IF NOT EXISTS SopTemplate (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS SopTemplateNode (
    id TEXT PRIMARY KEY,
    templateId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    sortOrder INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(templateId) REFERENCES SopTemplate(id) ON DELETE CASCADE,
    UNIQUE(templateId, sortOrder)
  );

  CREATE TABLE IF NOT EXISTS SopRun (
    id TEXT PRIMARY KEY,
    templateId TEXT NOT NULL,
    templateNameSnapshot TEXT NOT NULL,
    templateDescriptionSnapshot TEXT,
    version TEXT NOT NULL,
    startedAt TEXT,
    completedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(templateId) REFERENCES SopTemplate(id) ON DELETE RESTRICT,
    UNIQUE(templateId, version)
  );
  CREATE INDEX IF NOT EXISTS SopRun_completedAt_idx ON SopRun(completedAt);

  CREATE TABLE IF NOT EXISTS SopRunNode (
    id TEXT PRIMARY KEY,
    runId TEXT NOT NULL,
    nameSnapshot TEXT NOT NULL,
    descriptionSnapshot TEXT,
    sortOrder INTEGER NOT NULL,
    completedAt TEXT,
    firstCompletedAt TEXT,
    lastModifiedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(runId) REFERENCES SopRun(id) ON DELETE CASCADE,
    UNIQUE(runId, sortOrder)
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("SopTemplateNode", "isRequired", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("SopTemplateNode", "parentId", "TEXT");
ensureColumn("SopRunNode", "isRequired", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("SopRunNode", "parentId", "TEXT");
ensureColumn("SopRunNode", "firstCompletedAt", "TEXT");
ensureColumn("SopRunNode", "lastModifiedAt", "TEXT");

db.exec(`
  UPDATE SopRunNode
  SET firstCompletedAt = completedAt
  WHERE firstCompletedAt IS NULL AND completedAt IS NOT NULL;

  UPDATE SopRunNode
  SET lastModifiedAt = completedAt
  WHERE lastModifiedAt IS NULL AND completedAt IS NOT NULL;
`);

if (process.env.NODE_ENV !== "production") globalForDb.todoFlowDb = db;
