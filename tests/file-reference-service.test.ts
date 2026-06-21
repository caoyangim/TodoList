import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDir = path.resolve(process.cwd(), "data-test-file-reference");
const testDb = path.join(testDir, "todoflow-test.db");

process.env.DATABASE_URL = `file:${testDb}`;
process.env.NOTE_FILE_DIR = path.join(testDir, "note-files");
process.env.NOTE_IMAGE_DIR = path.join(testDir, "note-images");
process.env.TODOFLOW_ADMIN_USERNAME = "admin";
process.env.TODOFLOW_ADMIN_PASSWORD = "todoflow-test-password";

let db: typeof import("@/server/db").db;
let fileReferenceService: typeof import("@/server/services/file-reference-service").fileReferenceService;

const userId = randomUUID();
const otherUserId = randomUUID();
const fileId1 = randomUUID();
const fileId2 = randomUUID();
const todoId = randomUUID();

function insertUser(id: string, username: string) {
  db.prepare(
    `
    INSERT INTO User (id, username, passwordHash, role, isActive, mustChangePassword, createdAt, updatedAt)
    VALUES (?, ?, ?, 'USER', 1, 0, ?, ?)
  `,
  ).run(id, username, "hash", new Date().toISOString(), new Date().toISOString());
}

function insertFile(id: string, ownerId: string, extension = "png") {
  db.prepare(
    `
    INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    ownerId,
    extension === "jpg" ? "image/jpeg" : "image/png",
    extension,
    1024,
    `test.${extension}`,
    new Date().toISOString(),
  );
}

beforeAll(async () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  ({ db } = await import("@/server/db"));
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

  insertUser(userId, `user-${userId.slice(0, 8)}`);
  insertUser(otherUserId, `user-${otherUserId.slice(0, 8)}`);
});

describe("fileReferenceService", () => {
  describe("extractFileIds", () => {
    it("extracts fileIds from valid JSON", () => {
      const json = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1, fileId2],
      });
      expect(fileReferenceService.extractFileIds(json)).toEqual([fileId1, fileId2]);
    });

    it("falls back to imageIds for legacy format", () => {
      const json = JSON.stringify({
        html: "<p>test</p>",
        imageIds: [fileId1],
      });
      expect(fileReferenceService.extractFileIds(json)).toEqual([fileId1]);
    });

    it("returns empty array for null, invalid JSON, or unsupported shape", () => {
      expect(fileReferenceService.extractFileIds(null)).toEqual([]);
      expect(fileReferenceService.extractFileIds("invalid json")).toEqual([]);
      expect(fileReferenceService.extractFileIds(JSON.stringify({ html: "<p>test</p>" }))).toEqual([]);
    });
  });

  describe("getFileReferences", () => {
    it("finds file references in todo note and verification report", () => {
      insertFile(fileId1, userId);
      insertFile(fileId2, userId, "jpg");

      db.prepare(
        `
        INSERT INTO Todo (
          id, userId, title, description, note, verificationReport, status, priority,
          timePriority, importancePriority, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        todoId,
        userId,
        "Test",
        "",
        JSON.stringify({ html: "<p>note</p>", fileIds: [fileId1] }),
        JSON.stringify({ html: "<p>report</p>", fileIds: [fileId2] }),
        "COMPLETED",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      expect(fileReferenceService.getFileReferences(userId, fileId1)).toEqual([
        { tableName: "Todo", recordId: todoId, fieldName: "note" },
      ]);
      expect(fileReferenceService.getFileReferences(userId, fileId2)).toEqual([
        { tableName: "Todo", recordId: todoId, fieldName: "verificationReport" },
      ]);
    });

    it("filters SopRunNode references by owning user", () => {
      insertFile(fileId1, userId);
      insertFile(fileId2, otherUserId);

      const templateId = randomUUID();
      const otherTemplateId = randomUUID();
      const runId = randomUUID();
      const otherRunId = randomUUID();

      db.prepare(
        "INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(templateId, userId, "Template", "", new Date().toISOString(), new Date().toISOString());
      db.prepare(
        "INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(otherTemplateId, otherUserId, "Template", "", new Date().toISOString(), new Date().toISOString());

      db.prepare(
        "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(runId, userId, templateId, "Template", "Run", new Date().toISOString(), new Date().toISOString());
      db.prepare(
        "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(otherRunId, otherUserId, otherTemplateId, "Template", "Run", new Date().toISOString(), new Date().toISOString());

      db.prepare(
        "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        randomUUID(),
        otherRunId,
        "Other Node",
        JSON.stringify({ html: "<p>other</p>", fileIds: [fileId1] }),
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );

      expect(fileReferenceService.getFileReferences(userId, fileId1)).toEqual([]);
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(false);
    });
  });

  describe("getOrphanedFileIds", () => {
    it("returns only files that are no longer referenced", () => {
      insertFile(fileId1, userId);
      insertFile(fileId2, userId, "jpg");

      db.prepare(
        `
        INSERT INTO Todo (
          id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        todoId,
        userId,
        "Test",
        "",
        JSON.stringify({ html: "<p>test</p>", fileIds: [fileId1] }),
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      expect(fileReferenceService.getOrphanedFileIds(userId)).toEqual([fileId2]);
    });
  });

  describe("getFileIdsFromContent", () => {
    it("extracts file ids from todo content and field-specific content", () => {
      db.prepare(
        `
        INSERT INTO Todo (
          id, userId, title, description, note, verificationReport, status, priority,
          timePriority, importancePriority, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        todoId,
        userId,
        "Test",
        "",
        JSON.stringify({ html: "<p>note</p>", fileIds: [fileId1] }),
        JSON.stringify({ html: "<p>report</p>", fileIds: [fileId2] }),
        "COMPLETED",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      expect(fileReferenceService.getFileIdsFromContent("Todo", todoId)).toEqual([
        fileId1,
        fileId2,
      ]);
      expect(fileReferenceService.getFileIdsFromContent("Todo", todoId, "note")).toEqual([
        fileId1,
      ]);
      expect(fileReferenceService.getFileIdsFromContent("Todo", "missing-id")).toEqual([]);
    });
  });

  describe("getRunFileIds", () => {
    it("extracts deduplicated file ids from run nodes", () => {
      const templateId = randomUUID();
      const runId = randomUUID();
      const nodeId1 = randomUUID();
      const nodeId2 = randomUUID();

      db.prepare(
        "INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(templateId, userId, "Template", "", new Date().toISOString(), new Date().toISOString());
      db.prepare(
        "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(runId, userId, templateId, "Template", "Run", new Date().toISOString(), new Date().toISOString());

      db.prepare(
        "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        nodeId1,
        runId,
        "Node1",
        JSON.stringify({ html: "<p>test1</p>", fileIds: [fileId1, fileId2] }),
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
      db.prepare(
        "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        nodeId2,
        runId,
        "Node2",
        JSON.stringify({ html: "<p>test2</p>", fileIds: [fileId2] }),
        2,
        new Date().toISOString(),
        new Date().toISOString(),
      );

      expect(fileReferenceService.getRunFileIds(runId)).toEqual([fileId1, fileId2]);
    });
  });
});
