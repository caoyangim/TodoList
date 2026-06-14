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
    note TEXT,
    verificationReport TEXT,
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RESOLVED', 'COMPLETED')),
    timePriority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(timePriority IN ('LOW', 'MEDIUM', 'HIGH')),
    importancePriority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(importancePriority IN ('LOW', 'MEDIUM', 'HIGH')),
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
    title TEXT NOT NULL,
    version TEXT,
    startedAt TEXT,
    completedAt TEXT,
    archivedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(templateId) REFERENCES SopTemplate(id) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS SopRun_completedAt_idx ON SopRun(completedAt);

  CREATE TABLE IF NOT EXISTS NoteImage (
    id TEXT PRIMARY KEY,
    mimeType TEXT NOT NULL,
    extension TEXT NOT NULL,
    size INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS NoteFile (
    id TEXT PRIMARY KEY,
    mimeType TEXT NOT NULL,
    extension TEXT NOT NULL,
    size INTEGER NOT NULL,
    originalName TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS SopRunNode (
    id TEXT PRIMARY KEY,
    runId TEXT NOT NULL,
    nameSnapshot TEXT NOT NULL,
    descriptionSnapshot TEXT,
    note TEXT,
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
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      const isConcurrentDuplicate =
        error instanceof Error && error.message.includes(`duplicate column name: ${column}`);
      if (!isConcurrentDuplicate) throw error;
    }
  }
}

ensureColumn("SopTemplateNode", "isRequired", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("SopTemplateNode", "parentId", "TEXT");
ensureColumn("SopRunNode", "isRequired", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("SopRunNode", "parentId", "TEXT");
ensureColumn("SopRunNode", "firstCompletedAt", "TEXT");
ensureColumn("SopRunNode", "lastModifiedAt", "TEXT");
ensureColumn("SopRunNode", "note", "TEXT");
ensureColumn("Todo", "note", "TEXT");
ensureColumn("Todo", "verificationReport", "TEXT");
ensureColumn(
  "Todo",
  "status",
  "TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RESOLVED', 'COMPLETED'))",
);
ensureColumn(
  "Todo",
  "timePriority",
  "TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(timePriority IN ('LOW', 'MEDIUM', 'HIGH'))",
);
ensureColumn(
  "Todo",
  "importancePriority",
  "TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(importancePriority IN ('LOW', 'MEDIUM', 'HIGH'))",
);
ensureColumn("SopRun", "archivedAt", "TEXT");
ensureColumn("SopRun", "title", "TEXT");

db.exec(`
  CREATE INDEX IF NOT EXISTS SopRun_archivedAt_idx ON SopRun(archivedAt);
`);

function migrateSopRunVersionConstraint() {
  const createSql = (
    db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'SopRun'",
    ).get() as { sql: string } | undefined
  )?.sql;
  if (!createSql) return;
  const needsRebuild =
    createSql.includes("UNIQUE(templateId, version)") || createSql.includes("version TEXT NOT NULL");
  if (!needsRebuild) return;

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE SopRun_new (
          id TEXT PRIMARY KEY,
          templateId TEXT NOT NULL,
          templateNameSnapshot TEXT NOT NULL,
          templateDescriptionSnapshot TEXT,
          title TEXT NOT NULL,
          version TEXT,
          startedAt TEXT,
          completedAt TEXT,
          archivedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY(templateId) REFERENCES SopTemplate(id) ON DELETE RESTRICT
        );

        INSERT INTO SopRun_new (
          id, templateId, templateNameSnapshot, templateDescriptionSnapshot,
          title, version, startedAt, completedAt, archivedAt, createdAt, updatedAt
        )
        SELECT
          id, templateId, templateNameSnapshot, templateDescriptionSnapshot,
          title, NULLIF(TRIM(version), ''), startedAt, completedAt, archivedAt, createdAt, updatedAt
        FROM SopRun;

        DROP TABLE SopRun;
        ALTER TABLE SopRun_new RENAME TO SopRun;

        CREATE INDEX IF NOT EXISTS SopRun_completedAt_idx ON SopRun(completedAt);
        CREATE INDEX IF NOT EXISTS SopRun_archivedAt_idx ON SopRun(archivedAt);
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

migrateSopRunVersionConstraint();

db.exec(`
  UPDATE Todo
  SET timePriority = priority
  WHERE priority IS NOT NULL
    AND (timePriority IS NULL OR (timePriority = 'MEDIUM' AND priority != 'MEDIUM'));

  UPDATE Todo
  SET importancePriority = priority
  WHERE priority IS NOT NULL
    AND (importancePriority IS NULL OR (importancePriority = 'MEDIUM' AND priority != 'MEDIUM'));

  UPDATE Todo
  SET status = CASE
    WHEN completedAt IS NOT NULL THEN 'COMPLETED'
    ELSE 'PENDING'
  END
  WHERE status IS NULL OR TRIM(status) = '';

  UPDATE Todo
  SET status = 'COMPLETED'
  WHERE completedAt IS NOT NULL AND status = 'PENDING';

  UPDATE SopRun
  SET title = CASE
    WHEN version IS NULL OR TRIM(version) = '' THEN templateNameSnapshot
    ELSE templateNameSnapshot || ' / ' || version
  END
  WHERE title IS NULL OR TRIM(title) = '';

  UPDATE SopRunNode
  SET firstCompletedAt = completedAt
  WHERE firstCompletedAt IS NULL AND completedAt IS NOT NULL;

  UPDATE SopRunNode
  SET lastModifiedAt = completedAt
  WHERE lastModifiedAt IS NULL AND completedAt IS NOT NULL;
`);

// Migrate NoteImage -> NoteFile
const noteFileCount = (db.prepare("SELECT COUNT(*) AS count FROM NoteFile").get() as { count: number })
  .count;
if (noteFileCount === 0) {
  const oldImages = db.prepare("SELECT * FROM NoteImage").all() as {
    id: string;
    mimeType: string;
    extension: string;
    size: number;
    createdAt: string;
  }[];
  if (oldImages.length > 0) {
    const oldDir = path.resolve(process.cwd(), "data", "note-images");
    const newDir = path.resolve(process.cwd(), "data", "note-files");
    fs.mkdirSync(newDir, { recursive: true });
    const insert = db.prepare(
      "INSERT INTO NoteFile (id, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insertMany = db.transaction(() => {
      for (const row of oldImages) {
        insert.run(row.id, row.mimeType, row.extension, row.size, `${row.id}.${row.extension}`, row.createdAt);
        const oldPath = path.join(oldDir, `${row.id}.${row.extension}`);
        const newPath = path.join(newDir, `${row.id}.${row.extension}`);
        if (fs.existsSync(oldPath)) {
          try {
            fs.cpSync(oldPath, newPath);
          } catch {
            // skip files that can't be copied
          }
        }
      }
    });
    insertMany();

    // Migrate imageIds -> fileIds in note JSON
    const updateNotes = db.transaction(() => {
      for (const table of ["Todo", "SopRunNode"]) {
        const rows = db.prepare(`SELECT id, note FROM ${table} WHERE note IS NOT NULL`).all() as {
          id: string;
          note: string;
        }[];
        for (const row of rows) {
          try {
            const parsed = JSON.parse(row.note);
            if (parsed.imageIds && !parsed.fileIds) {
              parsed.fileIds = parsed.imageIds;
              delete parsed.imageIds;
              db.prepare(`UPDATE ${table} SET note = ? WHERE id = ?`).run(
                JSON.stringify(parsed),
                row.id,
              );
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    });
    updateNotes();
  }
}

if (process.env.NODE_ENV !== "production") globalForDb.todoFlowDb = db;
