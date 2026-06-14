import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { NoteFileDto } from "@/shared/types/models";

const fileDirectory = path.resolve(
  process.env.NOTE_FILE_DIR ?? path.join(process.cwd(), "data", "note-files"),
);
const maxFileSize = 10 * 1024 * 1024;

type NoteFileRow = {
  id: string;
  mimeType: string;
  extension: string;
  size: number;
  originalName: string;
};

function getRow(id: string) {
  return db.prepare("SELECT id, mimeType, extension, size, originalName FROM NoteFile WHERE id = ?").get(id) as
    | NoteFileRow
    | undefined;
}

function toDto(row: NoteFileRow): NoteFileDto {
  return {
    id: row.id,
    url: `/api/note-files/${row.id}`,
    mimeType: row.mimeType,
    size: row.size,
    originalName: row.originalName,
  };
}

export const noteFileService = {
  async create(file: File) {
    if (file.size === 0 || file.size > maxFileSize) {
      throw new AppError("FILE_SIZE_INVALID", "文件大小必须在 10 MB 以内", 400);
    }

    const id = randomUUID();
    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex > 0 ? file.name.slice(dotIndex + 1).toLowerCase() : "";
    const filename = extension ? `${id}.${extension}` : id;
    const now = new Date().toISOString();
    fs.mkdirSync(fileDirectory, { recursive: true });
    const filePath = path.join(fileDirectory, filename);
    fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
    try {
      db.prepare(
        "INSERT INTO NoteFile (id, mimeType, extension, size, originalName, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, file.type, extension, file.size, file.name, now);
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw error;
    }
    return toDto({ id, mimeType: file.type, extension, size: file.size, originalName: file.name });
  },

  async get(id: string) {
    const row = getRow(id);
    if (!row) throw new AppError("NOTE_FILE_NOT_FOUND", "备注文件不存在", 404);
    const filename = row.extension ? `${row.id}.${row.extension}` : row.id;
    const filePath = path.join(fileDirectory, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError("NOTE_FILE_NOT_FOUND", "备注文件不存在", 404);
    }
    return { ...row, bytes: fs.readFileSync(filePath) };
  },

  getMany(ids: string[]) {
    return ids.map((id) => {
      const row = getRow(id);
      if (!row) throw new AppError("NOTE_FILE_NOT_FOUND", "备注包含不存在的文件", 400);
      return toDto(row);
    });
  },

  async remove(id: string) {
    const row = getRow(id);
    if (!row) return;
    db.prepare("DELETE FROM NoteFile WHERE id = ?").run(id);
    const filename = row.extension ? `${row.id}.${row.extension}` : row.id;
    fs.rmSync(path.join(fileDirectory, filename), { force: true });
  },
};
