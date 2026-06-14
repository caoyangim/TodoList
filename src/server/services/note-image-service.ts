import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { NoteImageDto } from "@/shared/types/models";

const imageDirectory = path.resolve(
  process.env.NOTE_IMAGE_DIR ?? path.join(process.cwd(), "data", "note-images"),
);
const maxImageSize = 5 * 1024 * 1024;
const supportedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

type NoteImageRow = {
  id: string;
  mimeType: string;
  extension: string;
  size: number;
};

function getRow(id: string) {
  return db.prepare("SELECT id, mimeType, extension, size FROM NoteImage WHERE id = ?").get(id) as
    | NoteImageRow
    | undefined;
}

function toDto(row: NoteImageRow): NoteImageDto {
  return {
    id: row.id,
    url: `/api/note-images/${row.id}`,
    mimeType: row.mimeType,
    size: row.size,
    originalName: `${row.id}.${row.extension}`,
  };
}

export const noteImageService = {
  async create(file: File) {
    const extension = supportedTypes.get(file.type);
    if (!extension) {
      throw new AppError("UNSUPPORTED_IMAGE_TYPE", "仅支持 PNG、JPEG、WebP 和 GIF 图片", 400);
    }
    if (file.size === 0 || file.size > maxImageSize) {
      throw new AppError("IMAGE_SIZE_INVALID", "图片大小必须在 5 MB 以内", 400);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    fs.mkdirSync(imageDirectory, { recursive: true });
    const filePath = path.join(imageDirectory, `${id}.${extension}`);
    fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
    try {
      db.prepare(
        "INSERT INTO NoteImage (id, mimeType, extension, size, createdAt) VALUES (?, ?, ?, ?, ?)",
      ).run(id, file.type, extension, file.size, now);
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw error;
    }
    return toDto({ id, mimeType: file.type, extension, size: file.size });
  },

  async get(id: string) {
    const row = getRow(id);
    if (!row) throw new AppError("NOTE_IMAGE_NOT_FOUND", "备注图片不存在", 404);
    const filePath = path.join(imageDirectory, `${row.id}.${row.extension}`);
    if (!fs.existsSync(filePath)) {
      throw new AppError("NOTE_IMAGE_NOT_FOUND", "备注图片文件不存在", 404);
    }
    return { ...row, bytes: fs.readFileSync(filePath) };
  },

  getMany(ids: string[]) {
    return ids.map((id) => {
      const row = getRow(id);
      if (!row) throw new AppError("NOTE_IMAGE_NOT_FOUND", "备注包含不存在的图片", 400);
      return toDto(row);
    });
  },

  async remove(id: string) {
    const row = getRow(id);
    if (!row) return;
    db.prepare("DELETE FROM NoteImage WHERE id = ?").run(id);
    fs.rmSync(path.join(imageDirectory, `${row.id}.${row.extension}`), { force: true });
  },
};
