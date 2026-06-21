import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDir = path.resolve(process.cwd(), "data-test-file-cleanup");
const testDb = path.join(testDir, "todoflow-test.db");
const noteFileDir = path.join(testDir, "note-files");

process.env.DATABASE_URL = `file:${testDb}`;
process.env.NOTE_FILE_DIR = noteFileDir;
process.env.NOTE_IMAGE_DIR = path.join(testDir, "note-images");
process.env.TODOFLOW_ADMIN_USERNAME = "admin";
process.env.TODOFLOW_ADMIN_PASSWORD = "todoflow-test-password";

let db: typeof import("@/server/db").db;
let todoService: typeof import("@/server/services/todo-service").todoService;
let runService: typeof import("@/server/services/run-service").runService;
let fileReferenceService: typeof import("@/server/services/file-reference-service").fileReferenceService;

const userId = randomUUID();
const otherUserId = randomUUID();

function insertUser(id: string, username: string) {
  db.prepare(
    `
    INSERT INTO User (id, username, passwordHash, role, isActive, mustChangePassword, createdAt, updatedAt)
    VALUES (?, ?, ?, 'USER', 1, 0, ?, ?)
  `,
  ).run(id, username, "hash", new Date().toISOString(), new Date().toISOString());
}

function createStoredFile(fileId: string, ownerId: string, extension = "png") {
  db.prepare(
    `
    INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    fileId,
    ownerId,
    extension === "jpg" ? "image/jpeg" : "image/png",
    extension,
    4,
    `file.${extension}`,
    new Date().toISOString(),
  );

  fs.mkdirSync(noteFileDir, { recursive: true });
  fs.writeFileSync(path.join(noteFileDir, `${fileId}.${extension}`), Buffer.from([1, 2, 3, 4]));
}

async function waitFor(assertion: () => boolean, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("condition not met before timeout");
}

beforeAll(async () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  ({ db } = await import("@/server/db"));
  ({ todoService } = await import("@/server/services/todo-service"));
  ({ runService } = await import("@/server/services/run-service"));
  ({ fileReferenceService } = await import("@/server/services/file-reference-service"));
}, 60000);

afterAll(() => {
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.prepare("DELETE FROM Todo WHERE userId IN (?, ?)").run(userId, otherUserId);
  db.prepare(
    `
    DELETE FROM SopRunNode
    WHERE runId IN (SELECT id FROM SopRun WHERE userId IN (?, ?))
  `,
  ).run(userId, otherUserId);
  db.prepare("DELETE FROM SopRun WHERE userId IN (?, ?)").run(userId, otherUserId);
  db.prepare("DELETE FROM SopTemplate WHERE userId IN (?, ?)").run(userId, otherUserId);
  db.prepare("DELETE FROM NoteFile WHERE userId IN (?, ?)").run(userId, otherUserId);
  db.prepare("DELETE FROM User WHERE id IN (?, ?)").run(userId, otherUserId);
  fs.rmSync(noteFileDir, { recursive: true, force: true });

  insertUser(userId, `user-${userId.slice(0, 8)}`);
  insertUser(otherUserId, `user-${otherUserId.slice(0, 8)}`);
});

describe("文件清理集成测试", () => {
  it("删除 Todo 后会清掉不再被引用的文件记录和物理文件", async () => {
    const todoId = randomUUID();
    const fileId = randomUUID();
    createStoredFile(fileId, userId);

    db.prepare(
      `
      INSERT INTO Todo (
        id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      todoId,
      userId,
      "Todo",
      "",
      JSON.stringify({ html: "<p>note</p>", fileIds: [fileId] }),
      "PENDING",
      "MEDIUM",
      "MEDIUM",
      "MEDIUM",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    await todoService.remove(userId, todoId);

    await waitFor(() => {
      const fileRow = db.prepare("SELECT id FROM NoteFile WHERE id = ?").get(fileId);
      const filePath = path.join(noteFileDir, `${fileId}.png`);
      return !fileRow && !fs.existsSync(filePath);
    });
  });

  it("删除 Todo 时会保留仍被其他 Todo 引用的文件", async () => {
    const sharedFileId = randomUUID();
    const todoId1 = randomUUID();
    const todoId2 = randomUUID();
    createStoredFile(sharedFileId, userId);

    const noteJson = JSON.stringify({ html: "<p>note</p>", fileIds: [sharedFileId] });
    for (const currentTodoId of [todoId1, todoId2]) {
      db.prepare(
        `
        INSERT INTO Todo (
          id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        currentTodoId,
        userId,
        "Todo",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }

    await todoService.remove(userId, todoId1);

    const fileRow = db.prepare("SELECT id FROM NoteFile WHERE id = ?").get(sharedFileId);
    expect(fileRow).toBeTruthy();
    expect(fs.existsSync(path.join(noteFileDir, `${sharedFileId}.png`))).toBe(true);
    expect(fileReferenceService.isFileReferenced(userId, sharedFileId)).toBe(true);
  });

  it("删除 SopRun 后会清掉级联节点中遗留的文件", async () => {
    const templateId = randomUUID();
    const runId = randomUUID();
    const nodeId = randomUUID();
    const fileId = randomUUID();
    createStoredFile(fileId, userId);

    db.prepare(
      "INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(templateId, userId, "Template", "", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(runId, userId, templateId, "Template", "Run", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      nodeId,
      runId,
      "Node",
      JSON.stringify({ html: "<p>note</p>", fileIds: [fileId] }),
      1,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    await runService.remove(userId, runId);

    await waitFor(() => {
      const fileRow = db.prepare("SELECT id FROM NoteFile WHERE id = ?").get(fileId);
      return !fileRow && !fs.existsSync(path.join(noteFileDir, `${fileId}.png`));
    });
  });

  it("引用扫描不会把其他用户的 RunNode 误算进来", () => {
    const fileId = randomUUID();
    const templateId = randomUUID();
    const runId = randomUUID();
    createStoredFile(fileId, userId);

    db.prepare(
      "INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(templateId, otherUserId, "Template", "", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(runId, otherUserId, templateId, "Template", "Run", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      randomUUID(),
      runId,
      "Other Node",
      JSON.stringify({ html: "<p>note</p>", fileIds: [fileId] }),
      1,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    expect(fileReferenceService.isFileReferenced(userId, fileId)).toBe(false);
    expect(fileReferenceService.getOrphanedFileIds(userId)).toEqual([fileId]);
  });
});
