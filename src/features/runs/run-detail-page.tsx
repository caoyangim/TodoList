"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheckBig,
  File,
  FolderTree,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import { RichNoteEditor } from "@/components/rich-note-editor";
import { apiRequest } from "@/shared/api-client";
import { NoteContentDto, RunDto, RunNodeDto } from "@/shared/types/models";
import { formatFileSize } from "@/shared/format";

const statusText = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
};

export function RunDetailPage({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runAction, setRunAction] = useState<"archive" | "delete" | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [pendingUncheck, setPendingUncheck] = useState<RunNodeDto | null>(null);
  const [noteNode, setNoteNode] = useState<RunNodeDto | null>(null);
  const [noteValue, setNoteValue] = useState<NoteContentDto>({ html: "", files: [] });
  const [noteSaving, setNoteSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRun(await apiRequest<RunDto>(`/api/runs/${runId}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "执行记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleNode(nodeId: string, completed: boolean) {
    setBusyId(nodeId);
    setError("");
    try {
      const updated = await apiRequest<RunDto>(`/api/runs/${runId}/nodes/${nodeId}/completion`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      setRun(updated);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "节点更新失败");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState label="正在加载执行详情..." />;
  if (!run) return <div className="error-banner">{error || "执行记录不存在"}</div>;

  const roots = run.nodes.filter((node) => !node.parentId);
  const childrenOf = (parentId: string) => run.nodes.filter((node) => node.parentId === parentId);

  function requestToggle(node: RunNodeDto) {
    if (node.completedAt) {
      setPendingUncheck(node);
      return;
    }
    if (node.noteRequired) {
      const hasContent = node.note && (node.note.html.trim().length > 0 || node.note.files.length > 0);
      if (!hasContent) {
        setError("该节点要求必填备注才能完成，请先添加备注");
        openNote(node);
        return;
      }
    }
    void toggleNode(node.id, true);
  }

  async function confirmUncheck() {
    if (!pendingUncheck) return;
    const node = pendingUncheck;
    if (await toggleNode(node.id, false)) setPendingUncheck(null);
  }

  async function toggleArchived() {
    if (!run) return;
    setRunAction("archive");
    setError("");
    try {
      setRun(
        await apiRequest<RunDto>(`/api/runs/${runId}`, {
          method: "PATCH",
          body: JSON.stringify({ archived: !run.archivedAt }),
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "归档状态更新失败");
    } finally {
      setRunAction(null);
    }
  }

  async function removeRun() {
    setRunAction("delete");
    setError("");
    try {
      await apiRequest(`/api/runs/${runId}`, { method: "DELETE" });
      window.location.href = "/runs";
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
      setRunAction(null);
    }
  }

  function openTitleEditor(currentRun: RunDto) {
    setTitleValue(currentRun.title);
    setTitleEditing(true);
    setError("");
  }

  async function saveTitle(event: React.FormEvent) {
    event.preventDefault();
    setTitleSaving(true);
    setError("");
    try {
      setRun(
        await apiRequest<RunDto>(`/api/runs/${runId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: titleValue }),
        }),
      );
      setTitleEditing(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "标题保存失败");
    } finally {
      setTitleSaving(false);
    }
  }

  function openNote(node: RunNodeDto) {
    setNoteNode(node);
    setNoteValue(node.note ?? { html: "", files: [] });
    setError("");
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (!noteNode) return;
    setNoteSaving(true);
    setError("");
    try {
      setRun(
        await apiRequest<RunDto>(`/api/runs/${runId}/nodes/${noteNode.id}/note`, {
          method: "PATCH",
          body: JSON.stringify({
            note: {
              html: noteValue.html,
              fileIds: noteValue.files.map((f) => f.id),
            },
          }),
        }),
      );
      setNoteNode(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "备注保存失败");
    } finally {
      setNoteSaving(false);
    }
  }

  function renderNode(node: RunDto["nodes"][number]) {
    const children = childrenOf(node.id);
    const isExpanded = expandedParentIds.has(node.id);

    function toggleExpanded() {
      setExpandedParentIds((current) => {
        const next = new Set(current);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }

    return (
      <div className={`run-tree-node ${node.parentId ? "child" : ""}`} key={node.id}>
        <article
          aria-expanded={node.isParent ? isExpanded : undefined}
          className={`list-item ${node.isParent ? "parent-node expandable" : ""}`}
          onClick={node.isParent ? toggleExpanded : undefined}
          onKeyDown={
            node.isParent
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleExpanded();
                  }
                }
              : undefined
          }
          role={node.isParent ? "button" : undefined}
          tabIndex={node.isParent ? 0 : undefined}
        >
          {node.isParent ? (
            <button
              aria-label={node.completedAt ? "父节点已自动完成" : "父节点不可手动完成"}
              className={`check-button parent-check-button ${node.completedAt ? "checked" : ""}`}
              disabled
              title="父节点由全部子节点自动完成"
              type="button"
            >
              {node.completedAt ? <Check size={13} /> : <Circle size={13} />}
            </button>
          ) : (
            <button
              aria-label={node.completedAt ? "撤销完成" : "完成节点"}
              className={`check-button ${node.completedAt ? "checked" : ""}`}
              disabled={busyId === node.id}
              onClick={() => requestToggle(node)}
            >
              {busyId === node.id ? (
                <LoadingSpinner size={13} />
              ) : node.completedAt ? (
                <Check size={13} />
              ) : null}
            </button>
          )}
          <div className="list-item-main">
            <h2 className={`item-title ${node.completedAt ? "completed-text" : ""}`}>
              {node.isParent ? (
                <>
                  {isExpanded ? (
                    <ChevronDown size={16} style={{ display: "inline", marginRight: 5 }} />
                  ) : (
                    <ChevronRight size={16} style={{ display: "inline", marginRight: 5 }} />
                  )}
                  <FolderTree size={15} style={{ display: "inline", marginRight: 7 }} />
                </>
              ) : null}
              {node.name}
            </h2>
            {node.description ? <p className="item-description">{node.description}</p> : null}
            {node.note ? (
              <div className="node-note">
                <MessageSquare size={14} />
                <div className="node-note-content">
                  {node.note.html ? (
                    <div
                      className="rich-note-content"
                      dangerouslySetInnerHTML={{ __html: node.note.html }}
                    />
                  ) : null}
                  {node.note.files.length > 0 ? (
                    <div className="note-file-grid display">
                      {node.note.files.map((file) =>
                        file.mimeType.startsWith("image/") ? (
                          <a href={file.url} key={file.id} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt="节点备注图片" src={file.url} />
                          </a>
                        ) : (
                          <a
                            href={file.url}
                            key={file.id}
                            target="_blank"
                            rel="noreferrer"
                            className="note-file-card display"
                          >
                            <File size={20} />
                            <span className="note-file-card-name" title={file.originalName}>
                              {file.originalName}
                            </span>
                            <span className="note-file-card-size">{formatFileSize(file.size)}</span>
                          </a>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="item-meta">
              {node.isParent ? (
                <span className="badge not-started">父节点 · 自动完成</span>
              ) : (
                <>
                  {node.isRequired ? (
                    <span className="badge high">必须</span>
                  ) : (
                    <span className="badge low">可选</span>
                  )}
                  {node.noteRequired ? (
                    <span className="badge high">备注必填</span>
                  ) : null}
                </>
              )}
              {node.firstCompletedAt ? (
                <span>首次完成：{new Date(node.firstCompletedAt).toLocaleString("zh-CN")}</span>
              ) : null}
              {node.lastModifiedAt && node.lastModifiedAt !== node.firstCompletedAt ? (
                <span>上次修改：{new Date(node.lastModifiedAt).toLocaleString("zh-CN")}</span>
              ) : null}
              <button
                className="inline-action node-note-action"
                onClick={(event) => {
                  event.stopPropagation();
                  openNote(node);
                }}
                type="button"
              >
                <MessageSquare size={13} /> {node.note ? "编辑备注" : "添加备注"}
              </button>
            </div>
          </div>
        </article>
        {children.length && isExpanded ? (
          <div className="run-tree-children">{children.map(renderNode)}</div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <Link href={`/runs?templateId=${encodeURIComponent(run.templateId)}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            <ArrowLeft size={15} /> 返回执行列表
          </Link>
          <div className="run-title-row">
            <h1 className="page-title">{run.title}</h1>
            <button
              aria-label="编辑执行标题"
              className="button ghost icon-only"
              onClick={() => openTitleEditor(run)}
              title="编辑执行标题"
              type="button"
            >
              <Pencil size={16} />
            </button>
          </div>
          <p className="page-subtitle">
            {run.templateName}
            {run.version ? ` / 版本 ${run.version}` : " / 未填写版本号"}
            {run.templateDescription ? ` · ${run.templateDescription}` : ""}
          </p>
        </div>
        <div className="run-detail-actions">
          {run.archivedAt ? <span className="badge archived">已归档</span> : null}
          <span className={`badge ${run.status === "COMPLETED" ? "completed" : run.status === "IN_PROGRESS" ? "progress" : "not-started"}`}>{statusText[run.status]}</span>
          <button
            className="button"
            disabled={runAction !== null}
            onClick={() => void toggleArchived()}
            type="button"
          >
            {runAction === "archive" ? (
              <><LoadingSpinner /> 处理中...</>
            ) : (
              <>{run.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}{run.archivedAt ? "恢复" : "归档"}</>
            )}
          </button>
          <button
            className="button danger"
            disabled={runAction !== null}
            onClick={() => setPendingDelete(true)}
            type="button"
          >
            <Trash2 size={16} /> 删除
          </button>
        </div>
      </header>

      {error ? <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div> : null}

      <section className="detail-hero">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 12 }}>
          <div>
            <strong style={{ fontSize: 17 }}>执行进度</strong>
            <div className="page-subtitle" style={{ marginTop: 4 }}>
              {run.completedCount} / {run.totalCount} 个执行节点已完成
              {run.requiredTotalCount > 0
                ? ` · 必须 ${run.requiredCompletedCount}/${run.requiredTotalCount}`
                : ""}
            </div>
          </div>
          <strong style={{ fontSize: 24, color: run.status === "COMPLETED" ? "var(--success)" : "var(--accent)" }}>{run.progressPercent}%</strong>
        </div>
        <div className="progress-track"><div className="progress-bar" style={{ width: `${run.progressPercent}%`, background: run.status === "COMPLETED" ? "var(--success)" : undefined }} /></div>
        {run.status === "COMPLETED" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 15, color: "var(--success)", fontSize: 13, fontWeight: 600 }}>
            <CircleCheckBig size={17} /> 所有必须节点已完成
          </div>
        ) : null}
      </section>

      <div className="list">{roots.map(renderNode)}</div>

      {pendingUncheck ? (
        <Modal
          title="确认取消完成？"
          onClose={() => {
            if (busyId !== pendingUncheck.id) setPendingUncheck(null);
          }}
        >
          <div className="form-stack">
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.7 }}>
              将把“{pendingUncheck.name}”恢复为未完成状态，并重新计算父节点和 SOP
              状态。首次完成时间会保留，上次修改时间将更新为当前时间。
            </p>
            <div className="form-actions">
              <button className="button" disabled={busyId === pendingUncheck.id} type="button" onClick={() => setPendingUncheck(null)}>
                保持完成
              </button>
              <button
                className="button danger"
                disabled={busyId === pendingUncheck.id}
                type="button"
                onClick={() => void confirmUncheck()}
              >
                {busyId === pendingUncheck.id ? <><LoadingSpinner /> 处理中...</> : "确认取消完成"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {titleEditing ? (
        <Modal
          title="编辑执行标题"
          onClose={() => {
            if (!titleSaving) setTitleEditing(false);
          }}
        >
          <form className="form-stack" onSubmit={saveTitle}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label htmlFor="run-title-edit">执行标题</label>
              <input
                id="run-title-edit"
                className="input"
                autoFocus
                maxLength={100}
                required
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
              />
              <span className="field-hint">{titleValue.length} / 100</span>
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={titleSaving}
                onClick={() => setTitleEditing(false)}
                type="button"
              >
                取消
              </button>
              <button className="button primary" disabled={titleSaving} type="submit">
                {titleSaving ? <><LoadingSpinner /> 保存中...</> : "保存标题"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {noteNode ? (
        <Modal
          title={`${noteNode.note ? "编辑" : "添加"}节点备注`}
          onClose={() => {
            if (!noteSaving) setNoteNode(null);
          }}
        >
          <form className="form-stack" onSubmit={saveNote}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label>{noteNode.name}</label>
              <RichNoteEditor value={noteValue} onChange={setNoteValue} onError={setError} />
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={noteSaving}
                onClick={() => setNoteNode(null)}
                type="button"
              >
                取消
              </button>
              <button className="button primary" disabled={noteSaving} type="submit">
                {noteSaving ? <><LoadingSpinner /> 保存中...</> : "保存备注"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal
          title="确认删除执行？"
          onClose={() => {
            if (runAction !== "delete") setPendingDelete(false);
          }}
        >
          <div className="form-stack">
            {error ? <div className="error-banner">{error}</div> : null}
            <p className="modal-description">
              将永久删除“{run.title}”及其全部节点记录，此操作无法撤销。
            </p>
            <div className="form-actions">
              <button className="button" disabled={runAction === "delete"} type="button" onClick={() => setPendingDelete(false)}>
                取消
              </button>
              <button
                className="button danger"
                disabled={runAction !== null}
                onClick={() => void removeRun()}
                type="button"
              >
                {runAction === "delete" ? <><LoadingSpinner /> 删除中...</> : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
