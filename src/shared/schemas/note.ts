import { z } from "zod";
import { NoteDocumentDto } from "@/shared/note-document";

const noteMarkSchema = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  }),
);

const noteNodeSchema: z.ZodType<NoteDocumentDto> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(noteMarkSchema).optional(),
    content: z.array(noteNodeSchema).optional(),
  }),
);

export const noteCreateSchema = z.object({
  title: z.string().trim().max(100, "Note 标题不能超过 100 个字符").optional().nullable(),
  content: noteNodeSchema.optional(),
});

export const notePatchSchema = noteCreateSchema.partial();
