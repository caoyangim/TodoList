import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  legacyMarkdownToNoteDocument,
  normalizeNoteDocument,
  noteDocumentToExcerpt,
  noteDocumentToSafeHtml,
  noteDocumentToPlainText,
  noteDocumentToTitle,
} from "@/server/services/note-content-service";
import { emptyNoteDocument, NoteDocumentDto } from "@/shared/note-document";
import { noteCreateSchema, notePatchSchema } from "@/shared/schemas/note";
import { NoteDto, NoteSummaryDto } from "@/shared/types/models";

type NoteRow = Omit<NoteDto, "content"> & {
  userId: string;
  content: string;
  deletedAt: string | null;
  contentMarkdown: string | null;
};

function getNoteRow(userId: string, id: string) {
  return db
    .prepare("SELECT * FROM Note WHERE id = ? AND userId = ? AND deletedAt IS NULL")
    .get(id, userId) as NoteRow | undefined;
}

function toNoteDto(row: NoteRow): NoteDto {
  const content = parseNoteContent(row);
  return {
    id: row.id,
    title: row.title,
    content,
    contentHtml: row.contentHtml,
    excerpt: row.excerpt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toNoteSummaryDto(row: NoteRow): NoteSummaryDto {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseNoteContent(row: NoteRow): NoteDocumentDto {
  if (row.content) {
    try {
      return normalizeNoteDocument(JSON.parse(row.content) as NoteDocumentDto);
    } catch {
      // fall through to legacy content below
    }
  }

  if (row.contentMarkdown) {
    return legacyMarkdownToNoteDocument(row.contentMarkdown);
  }

  return emptyNoteDocument;
}

function buildContent(content: NoteDocumentDto) {
  const normalizedContent = normalizeNoteDocument(content);
  const plainText = noteDocumentToPlainText(normalizedContent);
  if (Array.from(plainText).length > 100000) {
    throw new AppError("NOTE_TOO_LONG", "Note 正文不能超过 100000 个字符", 400);
  }
  return {
    content: normalizedContent,
    contentHtml: noteDocumentToSafeHtml(normalizedContent),
    excerpt: noteDocumentToExcerpt(normalizedContent),
  };
}

export const noteService = {
  async list(userId: string) {
    return (
      db
        .prepare(
          "SELECT * FROM Note WHERE userId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC, createdAt DESC",
        )
        .all(userId) as NoteRow[]
    ).map(toNoteSummaryDto);
  },

  async get(userId: string, id: string) {
    const note = getNoteRow(userId, id);
    if (!note) throw new AppError("NOTE_NOT_FOUND", "Note 不存在", 404);
    return toNoteDto(note);
  },

  async create(userId: string, input: unknown) {
    const data = noteCreateSchema.parse(input);
    const content = buildContent(data.content ?? emptyNoteDocument);
    const now = new Date().toISOString();
    const note: NoteDto = {
      id: randomUUID(),
      title: noteDocumentToTitle(data.title, content.content),
      content: content.content,
      contentHtml: content.contentHtml,
      excerpt: content.excerpt,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO Note (
        id, userId, title, content, contentMarkdown, contentHtml, excerpt, deletedAt, createdAt, updatedAt
      ) VALUES (
        @id, @userId, @title, @content, '', @contentHtml, @excerpt, NULL, @createdAt, @updatedAt
      )
    `).run({
      ...note,
      content: JSON.stringify(note.content),
      userId,
    });

    return note;
  },

  async update(userId: string, id: string, input: unknown) {
    const current = await this.get(userId, id);
    const data = notePatchSchema.parse(input);
    const content = buildContent(data.content ?? current.content);
    const next: NoteDto = {
      ...current,
      title:
        data.title === undefined
          ? current.title
          : noteDocumentToTitle(data.title, content.content),
      content: content.content,
      contentHtml: content.contentHtml,
      excerpt: content.excerpt,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE Note
      SET title = @title,
          content = @content,
          contentHtml = @contentHtml,
          excerpt = @excerpt,
          updatedAt = @updatedAt
      WHERE id = @id AND userId = @userId AND deletedAt IS NULL
    `).run({
      ...next,
      content: JSON.stringify(next.content),
      userId,
    });

    return next;
  },

  async remove(userId: string, id: string) {
    const result = db
      .prepare("DELETE FROM Note WHERE id = ? AND userId = ? AND deletedAt IS NULL")
      .run(id, userId);
    if (result.changes === 0) throw new AppError("NOTE_NOT_FOUND", "Note 不存在", 404);
  },
};
