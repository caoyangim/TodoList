import { db } from "@/server/db";

type FileReference = {
  tableName: "Todo" | "SopRunNode";
  recordId: string;
  fieldName: "note" | "verificationReport";
};

/**
 * 文件引用管理器：追踪哪些记录引用了哪些文件
 */
export const fileReferenceService = {
  /**
   * 从 JSON 格式的备注中提取所有 fileIds
   */
  extractFileIds(jsonContent: string | null): string[] {
    if (!jsonContent) return [];
    try {
      const parsed = JSON.parse(jsonContent) as {
        fileIds?: string[];
        imageIds?: string[];
      };
      return parsed.fileIds ?? parsed.imageIds ?? [];
    } catch {
      return [];
    }
  },

  /**
   * 获取某个文件被哪些记录引用
   */
  getFileReferences(userId: string, fileId: string): FileReference[] {
    const references: FileReference[] = [];

    // 查询 Todo 中的 note 和 verificationReport
    const todoRows = db
      .prepare(
        "SELECT id, note, verificationReport FROM Todo WHERE userId = ? AND (note IS NOT NULL OR verificationReport IS NOT NULL)",
      )
      .all(userId) as {
      id: string;
      note: string | null;
      verificationReport: string | null;
    }[];

    for (const row of todoRows) {
      if (row.note && this.extractFileIds(row.note).includes(fileId)) {
        references.push({
          tableName: "Todo",
          recordId: row.id,
          fieldName: "note",
        });
      }
      if (
        row.verificationReport &&
        this.extractFileIds(row.verificationReport).includes(fileId)
      ) {
        references.push({
          tableName: "Todo",
          recordId: row.id,
          fieldName: "verificationReport",
        });
      }
    }

    // 查询 SopRunNode 中的 note
    const runNodeRows = db
      .prepare(
        `
        SELECT node.id, node.note
        FROM SopRunNode node
        INNER JOIN SopRun run ON run.id = node.runId
        WHERE run.userId = ? AND node.note IS NOT NULL
      `,
      )
      .all(userId) as { id: string; note: string | null }[];

    for (const row of runNodeRows) {
      if (row.note && this.extractFileIds(row.note).includes(fileId)) {
        references.push({
          tableName: "SopRunNode",
          recordId: row.id,
          fieldName: "note",
        });
      }
    }

    return references;
  },

  /**
   * 检查某个文件是否被任何记录引用
   */
  isFileReferenced(userId: string, fileId: string): boolean {
    return this.getFileReferences(userId, fileId).length > 0;
  },

  /**
   * 获取用户所有孤立的文件 ID
   * (在数据库中存在，但没有任何记录引用)
   */
  getOrphanedFileIds(userId: string): string[] {
    const allFileIds = (
      db.prepare("SELECT id FROM NoteFile WHERE userId = ?").all(userId) as {
        id: string;
      }[]
    ).map((row) => row.id);

    return allFileIds.filter(
      (fileId) => !this.isFileReferenced(userId, fileId),
    );
  },

  /**
   * 获取特定字段中的所有 fileIds（用于批量删除前的清理）
   */
  getFileIdsFromContent(
    tableName: "Todo" | "SopRunNode",
    recordId: string,
    fieldName?: string,
  ) {
    if (tableName === "Todo") {
      const row = db
        .prepare("SELECT note, verificationReport FROM Todo WHERE id = ?")
        .get(recordId) as
        | { note: string | null; verificationReport: string | null }
        | undefined;

      if (!row) return [];
      const ids: string[] = [];
      if (!fieldName || fieldName === "note") {
        ids.push(...this.extractFileIds(row.note));
      }
      if (!fieldName || fieldName === "verificationReport") {
        ids.push(...this.extractFileIds(row.verificationReport));
      }
      return [...new Set(ids)]; // 去重
    } else if (tableName === "SopRunNode") {
      const row = db
        .prepare("SELECT note FROM SopRunNode WHERE id = ?")
        .get(recordId) as { note: string | null } | undefined;

      if (!row) return [];
      return this.extractFileIds(row.note);
    }

    return [];
  },

  /**
   * 获取某个 SopRun 及其所有 Node 引用的所有 fileIds
   */
  getRunFileIds(runId: string): string[] {
    const nodeRows = db
      .prepare(
        "SELECT note FROM SopRunNode WHERE runId = ? AND note IS NOT NULL",
      )
      .all(runId) as { note: string | null }[];

    const ids: string[] = [];
    for (const row of nodeRows) {
      ids.push(...this.extractFileIds(row.note));
    }
    return [...new Set(ids)]; // 去重
  },
};
