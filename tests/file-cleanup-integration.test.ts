/**
 * 集成测试：验证文件清理功能
 * 测试删除 Todo、SopRun、以及用户注销时的文件清理
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/server/db";
import { todoService } from "@/server/services/todo-service";
import { runService } from "@/server/services/run-service";
import { noteFileService } from "@/server/services/note-file-service";
import { fileReferenceService } from "@/server/services/file-reference-service";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

describe("文件清理集成测试", () => {
  const userId = randomUUID();
  const fileId1 = randomUUID();
  const fileId2 = randomUUID();
  const fileId3 = randomUUID();
  const todoId = randomUUID();
  const runId = randomUUID();
  const templateId = randomUUID();

  // 模拟文件目录（实际测试会使用真实目录）
  const testFileDir = path.join(process.cwd(), "data", "test-note-files");

  beforeEach(() => {
    // 创建测试用户和文件记录
    db.prepare(
      "INSERT INTO User (id, username, passwordHash, role, isActive, mustChangePassword, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      userId,
      `test-user-${randomUUID()}`,
      "hash",
      "USER",
      1,
      0,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    // 创建测试文件记录
    [fileId1, fileId2, fileId3].forEach((id) => {
      db.prepare(
        "INSERT INTO NoteFile (id, userId, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        userId,
        "image/png",
        "png",
        1024,
        `file-${id}.png`,
        new Date().toISOString(),
      );
    });

    // 确保文件目录存在
    fs.mkdirSync(testFileDir, { recursive: true });
  });

  afterEach(() => {
    // 清理测试数据
    db.prepare("DELETE FROM Todo WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM SopRun WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM NoteFile WHERE userId = ?").run(userId);
    db.prepare("DELETE FROM User WHERE id = ?").run(userId);

    // 清理测试文件目录
    if (fs.existsSync(testFileDir)) {
      try {
        fs.rmSync(testFileDir, { recursive: true, force: true });
      } catch {
        // 忽略删除失败
      }
    }
  });

  describe("删除 Todo 时清理孤立文件", () => {
    it("应该删除未被引用的文件", async () => {
      // 创建 Todo，引用 fileId1
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });
      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
        userId,
        "Test Todo",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      // 验证文件被引用
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(true);
      expect(fileReferenceService.isFileReferenced(userId, fileId2)).toBe(
        false,
      );

      // 删除 Todo
      await todoService.remove(userId, todoId);

      // 验证 Todo 已删除
      expect(
        db.prepare("SELECT id FROM Todo WHERE id = ?").get(todoId),
      ).toBeUndefined();

      // fileId1 应该变成孤立的
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(
        false,
      );
    });

    it("应该保留被其他记录引用的文件", async () => {
      const todoId1 = randomUUID();
      const todoId2 = randomUUID();

      // 两个 Todo 都引用 fileId1
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });

      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId1,
        userId,
        "Todo 1",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId2,
        userId,
        "Todo 2",
        "",
        noteJson,
        "PENDING",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      // 删除第一个 Todo
      await todoService.remove(userId, todoId1);

      // fileId1 仍然被 Todo 2 引用，不应该被删除
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(true);
    });

    it("应该清理 note 和 verificationReport 中的孤立文件", async () => {
      const noteJson = JSON.stringify({
        html: "<p>note</p>",
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
        "Todo",
        "",
        noteJson,
        verificationJson,
        "COMPLETED",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      // 两个文件都被引用
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(true);
      expect(fileReferenceService.isFileReferenced(userId, fileId2)).toBe(true);

      // 删除 Todo
      await todoService.remove(userId, todoId);

      // 两个文件都应该变成孤立的
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(
        false,
      );
      expect(fileReferenceService.isFileReferenced(userId, fileId2)).toBe(
        false,
      );
    });
  });

  describe("删除 SopRun 时清理孤立文件", () => {
    it("应该清理级联删除的 SopRunNode 中的孤立文件", async () => {
      const nodeId = randomUUID();
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });

      // 创建 SopTemplate 和 SopRun
      db.prepare(
        "INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        templateId,
        userId,
        "Template",
        "",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      db.prepare(
        "INSERT INTO SopRun (id, userId, templateId, templateNameSnapshot, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        runId,
        userId,
        templateId,
        "Template",
        "Run",
        new Date().toISOString(),
        new Date().toISOString(),
      );

      db.prepare(
        "INSERT INTO SopRunNode (id, runId, nameSnapshot, note, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        nodeId,
        runId,
        "Node",
        noteJson,
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );

      // 验证文件被引用
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(true);

      // 删除 SopRun
      await runService.remove(userId, runId);

      // 验证 SopRun 已删除，级联删除了 Node
      expect(
        db.prepare("SELECT id FROM SopRun WHERE id = ?").get(runId),
      ).toBeUndefined();
      expect(
        db.prepare("SELECT id FROM SopRunNode WHERE id = ?").get(nodeId),
      ).toBeUndefined();

      // fileId1 应该变成孤立的
      expect(fileReferenceService.isFileReferenced(userId, fileId1)).toBe(
        false,
      );
    });
  });

  describe("文件引用追踪", () => {
    it("应该正确追踪文件被引用的位置", async () => {
      const noteJson = JSON.stringify({
        html: "<p>test</p>",
        fileIds: [fileId1],
      });

      db.prepare(
        "INSERT INTO Todo (id, userId, title, description, note, status, priority, timePriority, importancePriority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        todoId,
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

      const refs = fileReferenceService.getFileReferences(userId, fileId1);
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        tableName: "Todo",
        recordId: todoId,
        fieldName: "note",
      });
    });

    it("应该识别孤立文件", async () => {
      // fileId1 和 fileId2 都不被引用
      const orphaned = fileReferenceService.getOrphanedFileIds(userId);
      expect(orphaned).toContain(fileId1);
      expect(orphaned).toContain(fileId2);
      expect(orphaned).toContain(fileId3);
    });
  });
});
