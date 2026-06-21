import { emptyNoteDocument } from "@/shared/note-document";
import { apiRequest } from "@/shared/api-client";
import { NoteDto, NoteSummaryDto } from "@/shared/types/models";

export function listNotes() {
  return apiRequest<NoteSummaryDto[]>("/api/notes");
}

export function getNote(id: string) {
  return apiRequest<NoteDto>(`/api/notes/${id}`);
}

export function createNote() {
  return apiRequest<NoteDto>("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      title: "",
      content: emptyNoteDocument,
    }),
  });
}

export function updateNote(
  id: string,
  input: {
    title: string;
    content: NoteDto["content"];
  },
) {
  return apiRequest<NoteDto>(`/api/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteNote(id: string) {
  return apiRequest<void>(`/api/notes/${id}`, { method: "DELETE" });
}
