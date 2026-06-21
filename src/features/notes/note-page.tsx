"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import { Modal } from "@/components/modal";
import { emptyNoteDocument, NoteDocumentDto } from "@/shared/note-document";
import { getApiErrorMessage } from "@/shared/api-client";
import { NoteDto, NoteSummaryDto } from "@/shared/types/models";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from "@/features/notes/note-api";
import { NoteEditor } from "@/features/notes/note-editor";
import { NoteList } from "@/features/notes/note-list";

export function NotePage() {
  const [notes, setNotes] = useState<NoteSummaryDto[]>([]);
  const [selected, setSelected] = useState<NoteDto | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<NoteDocumentDto>(emptyNoteDocument);
  const [loading, setLoading] = useState(true);
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef(title);
  const contentRef = useRef(content);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const contentKey = useMemo(() => JSON.stringify(content), [content]);
  const savedContentKey = useMemo(
    () => JSON.stringify(selected?.content ?? emptyNoteDocument),
    [selected],
  );

  const dirty = useMemo(
    () =>
      Boolean(selected) &&
      (title !== selected?.title || contentKey !== savedContentKey),
    [contentKey, savedContentKey, selected, title],
  );

  const syncSelected = useCallback((note: NoteDto) => {
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
  }, []);

  const replaceSummary = useCallback((note: NoteDto) => {
    setNotes((current) => {
      const summary: NoteSummaryDto = {
        id: note.id,
        title: note.title,
        excerpt: note.excerpt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      };
      const withoutCurrent = current.filter((item) => item.id !== note.id);
      return [summary, ...withoutCurrent].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listNotes();
      setNotes(data);
      if (data.length > 0) {
        const first = await getNote(data[0].id);
        syncSelected(first);
      } else {
        setSelected(null);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Note 加载失败"));
    } finally {
      setLoading(false);
    }
  }, [syncSelected]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistNote = useCallback(
    async (noteId: string, nextTitle: string, nextContent: NoteDocumentDto) => {
      setSaving(true);
      setError("");
      try {
        const note = await updateNote(noteId, { title: nextTitle, content: nextContent });
        replaceSummary(note);
        setSelected((current) => (current?.id === noteId ? note : current));

        if (titleRef.current === nextTitle) {
          setTitle(note.title);
        }
        if (JSON.stringify(contentRef.current) === JSON.stringify(nextContent)) {
          setContent(note.content);
        }
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Note 保存失败"));
      } finally {
        setSaving(false);
      }
    },
    [replaceSummary],
  );

  useEffect(() => {
    if (!selected) return;
    const selectedId = selected.id;
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving && !deleting) {
          void persistNote(selectedId, title, content);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, deleting, dirty, persistNote, saving, selected, title]);

  useEffect(() => {
    if (!selected || !dirty || saving || deleting || creating || loadingNoteId) return;
    const timeoutId = window.setTimeout(() => {
      void persistNote(selected.id, title, content);
    }, 900);
    return () => window.clearTimeout(timeoutId);
  }, [content, creating, deleting, dirty, loadingNoteId, persistNote, saving, selected, title]);

  function confirmDiscardChanges() {
    return !dirty || window.confirm("当前 Note 有未保存修改，确定继续吗？");
  }

  async function selectNote(id: string) {
    if (id === selected?.id) return;
    if (!confirmDiscardChanges()) return;
    setLoadingNoteId(id);
    setError("");
    try {
      syncSelected(await getNote(id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Note 加载失败"));
    } finally {
      setLoadingNoteId(null);
    }
  }

  async function handleCreate() {
    if (!confirmDiscardChanges()) return;
    setCreating(true);
    setError("");
    try {
      const note = await createNote();
      replaceSummary(note);
      syncSelected(note);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Note 创建失败"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    await persistNote(selected.id, title, content);
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    setError("");
    try {
      await deleteNote(selected.id);
      const nextNotes = notes.filter((note) => note.id !== selected.id);
      setNotes(nextNotes);
      setDeleteConfirmOpen(false);
      if (nextNotes.length > 0) {
        syncSelected(await getNote(nextNotes[0].id));
      } else {
        setSelected(null);
        setTitle("");
        setContent(emptyNoteDocument);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Note 删除失败"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="workspace note-workspace">
      <aside className="workspace-sidebar" aria-label="Note 列表">
        <div className="workspace-sidebar-header">
          <div>
            <h1 className="workspace-title">Note</h1>
            <p className="workspace-subtitle">文档工作区</p>
          </div>
          <button
            className="button icon-only"
            type="button"
            aria-label="新建 Note"
            disabled={creating || saving || deleting}
            onClick={() => void handleCreate()}
          >
            {creating ? <LoadingSpinner /> : <Plus size={16} />}
          </button>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
        {loading ? (
          <LoadingState label="正在加载 Note..." />
        ) : (
          <NoteList
            notes={notes}
            selectedId={selected?.id ?? null}
            disabled={Boolean(loadingNoteId) || saving || deleting}
            onSelect={(id) => void selectNote(id)}
          />
        )}
      </aside>
      <section className="workspace-main note-workspace-main" aria-label="Note 编辑区">
        {loading ? null : selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            title={title}
            content={content}
            saving={saving}
            deleting={deleting}
            dirty={dirty}
            onTitleChange={setTitle}
            onContentChange={setContent}
            onSaveNow={() => void handleSave()}
            onDelete={() => setDeleteConfirmOpen(true)}
          />
        ) : (
          <EmptyState
            title="还没有 Note"
            description="从一个空白笔记开始。"
            action={
              <button
                className="button primary"
                disabled={creating}
                onClick={() => void handleCreate()}
                type="button"
              >
                {creating ? <LoadingSpinner /> : <Plus size={16} />}
                新建 Note
              </button>
            }
          />
        )}
      </section>

      {deleteConfirmOpen && selected ? (
        <Modal
          title="确认删除 Note？"
          onClose={() => {
            if (!deleting) setDeleteConfirmOpen(false);
          }}
        >
          <div className="form-stack">
            {error ? <div className="error-banner">{error}</div> : null}
            <p className="modal-description">
              将永久删除“{selected.title}”，此操作无法撤销。
            </p>
            <div className="form-actions">
              <button
                className="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="button danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
                type="button"
              >
                {deleting ? <><LoadingSpinner /> 删除中...</> : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
