import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { fileReferenceService } from "@/server/services/file-reference-service";
import { randomUUID } from "node:crypto";

describe("fileReferenceService", () => {
  const userId = randomUUID();
  const fileId1 = randomUUID();
  const fileId2 = randomUUID();
  const todoId = randomUUID();

  beforeEach(() => {
    // 清理测试数据
    db.prepare("DELETE FROM Todo WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM NoteFile WHERE userId = ?").run(userId);
  });

  describe("extractFileIds", () => {
    it("should extract fileIds from valid JSON", () => {
      const json = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1, fileId2],
      });
      const ids = fileReferenceService.extractFileIds(json);
      expect(ids).toEqual([fileId1, fileId2]);
    });

    it("should fallback to imageIds for legacy format", () => {
      const json = JSON.stringify({
        html: "<p>test</p>",
        imageIds: [fileId1],
      });
      const ids = fileReferenceService.extractFileIds(json);
      expect(ids).toEqual([fileId1]);
    });

    it("should return empty array for null or invalid JSON", () => {
      expect(fileReferenceService.extractFileIds(null)).toEqual([]);
      expect(fileReferenceService.extractFileIds("invalid json")).toEqual([]);
    });

    it("should return empty array for JSON without fileIds", () => {
      const json = JSON.stringify({ html: "<p>test</p>" });
      const ids = fileReferenceService.extractFileIds(json);
      expect(ids).toEqual([]);
    });
  });

  describe("getFileReferences", () => {
    beforeEach(() => {
      // 创建测试文件记录
      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fileId1,
        userId,
        "image/png",
        "png",
        1024,
        "test.png",
        new Date().toISOString(),
      );

      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fileId2,
        userId,
        "image/jpeg",
        "jpg",
        2048,
        "test.jpg",
        new Date().toISOString(),
      );
    });

    it("should find fileId referenced in todo note", () => {
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const refs = fileReferenceService.getFileReferences(userId, fileId1);
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        tableName: "Todo",
        recordId: todoId,
        fieldName: "note",
      });
    });

    it("should find fileId referenced in todo verificationReport", () => {
      const verificationJson = JSON.stringify({
        html: "<p>verified</p>",
        fileIds: [fileId2],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, verificationReport, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        verificationJson,
        "COMPLETED",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const refs = fileReferenceService.getFileReferences(userId, fileId2);
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        tableName: "Todo",
        recordId: todoId,
        fieldName: "verificationReport",
      });
    });

    it("should return empty array for unreferenced file", () => {
      const refs = fileReferenceService.getFileReferences(userId, fileId1);
      expect(refs).toEqual([]);
    });
  });

  describe("isFileReferenced", () => {
    beforeEach(() => {
      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fileId1,
        userId,
        "image/png",
        "png",
        1024,
        "test.png",
        new Date().toISOString(),
      );
    });

    it("should return true when file is referenced", () => {
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(true);
    });

    it("should return false when file is not referenced", () => {
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(
        false,
      );
    });
  });

  describe("getOrphanedFileIds", () => {
    it("should find all unreferenced files", () => {
      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fileId1,
        userId,
        "image/png",
        "png",
        1024,
        "test.png",
        new Date().toISOString(),
      );

      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fileId2,
        userId,
        "image/jpeg",
        "jpg",
        2048,
        "test.jpg",
        new Date().toISOString(),
      );

      // fileId1 被引用，fileId2 没有
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const orphaned = fileReferenceService.getOrphanedFileIds(userId);
      expect(orphaned).toEqual([fileId2]);
    });

    it("should return empty array when no orphaned files", () => {
      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        fileId1,
        userId,
        "image/png",
        "png",
        1024,
        "test.png",
        new Date().toISOString(),
      );

      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const orphaned = fileReferenceService.getOrphanedFileIds(userId);
      expect(orphaned).toEqual([]);
    });
  });

  describe("getFileIdsFromContent", () => {
    it("should extract fileIds from todo note", () => {
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1, fileId2],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const ids = fileReferenceService.getFileIdsFromContent("Todo", todoId);
      expect(ids).toContain(fileId1);
      expect(ids).toContain(fileId2);
    });

    it("should extract only from specific field when specified", () => {
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });
      const verificationJson = JSON.stringify({
        html: "<p>verified</p>",
        fileIds: [fileId2],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, verificationReport, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test",
        "",
        noteJson,
        verificationJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const ids = fileReferenceService.getFileIdsFromContent(
        "Todo",
        todoId,
        "note",
      );
      expect(ids).toEqual([fileId1]);
    });

    it("should return empty array for non-existent record", () => {
      const ids = fileReferenceService.getFileIdsFromContent(
        "Todo",
        "non-existent-id",
      );
      expect(ids).toEqual([]);
    });
  });

  describe("getRunFileIds", () => {
    it("should extract all fileIds from run nodes", () => {
      const runId = randomUUID();
      const nodeId1 = randomUUID();
      const nodeId2 = randomUUID();

      const note1Json = JSON.stringify({
        html: "<p>test1</p>",
        fileIds: [fileId1],
      });
      const note2Json = JSON.stringify({
        html: "<p>test2</p>",
        fileIds: [fileId2],
      });

      db.prepare(
        "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        runId,
        userId,
        randomUUID(),
        "Template",
        "Run",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      db.prepare(
        "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        nodeId1,
        runId,
        "Node1",
        note1Json,
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
        note2Json,
        2,
        new Date().toISOString(),
        new Date().toISOString(),
      );

      const ids = fileReferenceService.getRunFileIds(runId);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(fileId1);
      expect(ids).toContain(fileId2);
    });
  });
});
