"use client";

import { FileText } from "lucide-react";
import { NoteSummaryDto } from "@/shared/types/models";

function formatNoteUpdatedAt(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NoteList({
  notes,
  selectedId,
  disabled,
  onSelect,
}: {
  notes: NoteSummaryDto[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  if (notes.length === 0) {
    return (
      <div className="workspace-sidebar-empty">
        <FileText size={18} />
        <span>还没有 Note。</span>
      </div>
    );
  }

  return (
    <div className="note-list">
      {notes.map((note) => (
        <button
          className={`note-list-item ${note.id === selectedId ? "active" : ""}`}
          disabled={disabled}
          key={note.id}
          onClick={() => onSelect(note.id)}
          type="button"
        >
          <span className="note-list-title">{note.title}</span>
          {note.excerpt ? <span className="note-list-excerpt">{note.excerpt}</span> : null}
          <span className="note-list-meta">{formatNoteUpdatedAt(note.updatedAt)}</span>
        </button>
      ))}
    </div>
  );
}
