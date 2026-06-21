"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import { Modal } from "@/components/modal";
import { RunCreateModal } from "@/features/runs/run-create-modal";
import { apiRequest } from "@/shared/api-client";
import { RunDto, TemplateDto } from "@/shared/types/models";

const statusText = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
};

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function progressClass(run: RunDto) {
  if (run.status === "COMPLETED") return "completed";
  if (run.progressPercent >= 80) return "near-complete";
  return "";
}

export function RunListPage({ initialTemplateId }: { initialTemplateId: string | null }) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RunDto | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [runData, templateData] = await Promise.all([
        apiRequest<RunDto[]>("/api/runs"),
        apiRequest<TemplateDto[]>("/api/templates"),
      ]);
      setRuns(runData);
      setTemplates(templateData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "执行记录加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedTemplateId(initialTemplateId);
  }, [initialTemplateId]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const selectedRuns = useMemo(
    () => runs.filter((run) => run.templateId === selectedTemplateId),
    [runs, selectedTemplateId],
  );
  const activeRuns = selectedRuns.filter((run) => !run.archivedAt);
  const archivedRuns = selectedRuns.filter((run) => run.archivedAt);

  function openCreate(template?: TemplateDto) {
    setError("");
    setCreateTemplateId(template?.id ?? templates[0]?.id ?? null);
    setCreateOpen(true);
  }

  function selectTemplate(id: string | null) {
    setSelectedTemplateId(id);
    router.push(id ? `/runs?templateId=${encodeURIComponent(id)}` : "/runs");
  }

  async function setArchived(run: RunDto, archived: boolean) {
    setBusyId(`archive:${run.id}`);
    setError("");
    try {
      const updated = await apiRequest<RunDto>(`/api/runs/${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
      setRuns((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "归档状态更新失败");
    } finally {
      setBusyId(null);
    }
  }

  async function removeRun() {
    if (!pendingDelete) return;
    const run = pendingDelete;
    setBusyId(`delete:${run.id}`);
    setError("");
    try {
      await apiRequest(`/api/runs/${run.id}`, { method: "DELETE" });
      setRuns((current) => current.filter((item) => item.id !== run.id));
      setPendingDelete(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  function renderRunList(items: RunDto[], emptyText: string) {
    if (items.length === 0) {
      return <p className="section-empty">{emptyText}</p>;
    }

    return (
      <div className="list">
        {items.map((run) => {
          const isArchiving = busyId === `archive:${run.id}`;
          const isDeleting = busyId === `delete:${run.id}`;
          const isBusy = isArchiving || isDeleting;
          return (
          <article className="list-item run-list-item" key={run.id}>
            <ListChecks size={20} color="var(--accent)" />
            <Link className="list-item-main" href={`/runs/${run.id}`}>
              <h3 className="item-title">
                {run.title}
                {run.archivedAt ? <span className="archived-label">已归档</span> : null}
              </h3>
              <div className="item-meta">
                <span
                  className={`badge ${
                    run.status === "COMPLETED"
                      ? "completed"
                      : run.status === "IN_PROGRESS"
                        ? "progress"
                        : "not-started"
                  }`}
                >
                  {statusText[run.status]}
                </span>
                {run.version ? <span>版本 {run.version}</span> : <span>未填写版本号</span>}
                <span>
                  {run.completedCount}/{run.totalCount} 个执行节点
                  {run.requiredTotalCount > 0
                    ? ` · 必须 ${run.requiredCompletedCount}/${run.requiredTotalCount}`
                    : ""}
                </span>
                <span>更新于 {formatUpdatedAt(run.updatedAt)}</span>
              </div>
              <div className="progress-track progress-track-spaced">
                <div
                  className={`progress-bar ${progressClass(run)}`}
                  style={{ width: `${run.progressPercent}%` }}
                />
              </div>
            </Link>
            <div className="item-actions run-actions">
              <button
                aria-label={run.archivedAt ? "恢复执行" : "归档执行"}
                className="button ghost icon-only"
                disabled={isBusy}
                onClick={() => void setArchived(run, !run.archivedAt)}
                title={run.archivedAt ? "恢复到进行中的执行" : "归档执行"}
                type="button"
              >
                {isArchiving ? (
                  <LoadingSpinner />
                ) : run.archivedAt ? (
                  <ArchiveRestore size={16} />
                ) : (
                  <Archive size={16} />
                )}
              </button>
              <button
                aria-label="删除执行"
                className="button ghost icon-only danger"
                disabled={isBusy}
                onClick={() => setPendingDelete(run)}
                title="删除执行"
                type="button"
              >
                {isDeleting ? <LoadingSpinner /> : <Trash2 size={16} />}
              </button>
            </div>
            <Link aria-label={`查看执行 ${run.title}`} href={`/runs/${run.id}`}>
              <ChevronRight size={18} color="var(--muted)" />
            </Link>
          </article>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          {selectedTemplate ? (
            <button className="back-link" onClick={() => selectTemplate(null)} type="button">
              <ArrowLeft size={15} /> 返回模板分类
            </button>
          ) : null}
          <h1 className="page-title">{selectedTemplate?.name ?? "SOP 执行"}</h1>
          <p className="page-subtitle">
            {selectedTemplate
              ? selectedTemplate.description || "查看这个模板下的全部执行记录。"
              : "按模板查看并管理独立、可追踪的执行记录。"}
          </p>
        </div>
        <button
          className="button primary"
          disabled={loading}
          onClick={() => openCreate(selectedTemplate)}
          type="button"
        >
          <Plus size={17} /> 创建执行
        </button>
      </header>

      {error && !createOpen && !pendingDelete ? (
        <div className="error-banner page-section">
          {error}
        </div>
      ) : null}
      {loading ? (
        <LoadingState label="正在加载执行记录..." />
      ) : templates.length === 0 ? (
        <EmptyState
          title="还没有 SOP 模板"
          description="可以直接创建执行，并在弹窗中填写自定义模板。"
          action={
            <button className="button primary" onClick={() => openCreate()} type="button">
              创建执行
            </button>
          }
        />
      ) : selectedTemplate ? (
        <div className="run-groups">
          <section>
            <div className="section-heading">
              <h2>进行中的执行</h2>
              <span>{activeRuns.length}</span>
            </div>
            {renderRunList(activeRuns, "这个模板下暂无未归档的执行。")}
          </section>
          <section>
            <div className="section-heading">
              <h2>已归档</h2>
              <span>{archivedRuns.length}</span>
            </div>
            {renderRunList(archivedRuns, "暂无已归档的执行。")}
          </section>
        </div>
      ) : (
        <div className="card-grid">
          {templates.map((template) => {
            const templateRuns = runs.filter((run) => run.templateId === template.id);
            const activeCount = templateRuns.filter((run) => !run.archivedAt).length;
            const archivedCount = templateRuns.length - activeCount;
            return (
              <button
                className="card template-run-card"
                key={template.id}
                onClick={() => selectTemplate(template.id)}
                type="button"
              >
                <div className="card-header">
                  <div>
                    <ClipboardList size={20} color="var(--accent)" />
                    <h2 className="item-title card-item-title">
                      {template.name}
                    </h2>
                  </div>
                  <ChevronRight size={18} color="var(--muted)" />
                </div>
                {template.description ? (
                  <p className="item-description">{template.description}</p>
                ) : null}
                <div className="item-meta card-item-meta">
                  <span>{activeCount} 条进行中</span>
                  <span>{archivedCount} 条已归档</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {createOpen ? (
        <RunCreateModal
          templates={templates}
          initialTemplateId={createTemplateId}
          onClose={() => setCreateOpen(false)}
          onCreated={(run) => {
            setCreateOpen(false);
            window.location.href = `/runs/${run.id}`;
          }}
        />
      ) : null}

      {pendingDelete ? (
        <Modal
          title="确认删除执行？"
          onClose={() => {
            if (busyId !== `delete:${pendingDelete.id}`) setPendingDelete(null);
          }}
        >
          <div className="form-stack">
            {error ? <div className="error-banner">{error}</div> : null}
            <p className="modal-description">
              将永久删除“{pendingDelete.title}”及其全部节点记录，
              此操作无法撤销。
            </p>
            <div className="form-actions">
              <button className="button" disabled={busyId === `delete:${pendingDelete.id}`} type="button" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button
                className="button danger"
                disabled={busyId === `delete:${pendingDelete.id}`}
                onClick={() => void removeRun()}
                type="button"
              >
                {busyId === `delete:${pendingDelete.id}` ? <><LoadingSpinner /> 删除中...</> : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
