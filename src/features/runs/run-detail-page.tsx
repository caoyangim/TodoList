"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheckBig,
  FolderTree,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { apiRequest } from "@/shared/api-client";
import { RunDto, RunNodeDto } from "@/shared/types/models";

const statusText = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
};

export function RunDetailPage({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingUncheck, setPendingUncheck] = useState<RunNodeDto | null>(null);
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
      await apiRequest(`/api/runs/${runId}/nodes/${nodeId}/completion`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "节点更新失败");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="loading">正在加载执行详情...</div>;
  if (!run) return <div className="error-banner">{error || "执行记录不存在"}</div>;

  const roots = run.nodes.filter((node) => !node.parentId);
  const childrenOf = (parentId: string) => run.nodes.filter((node) => node.parentId === parentId);

  function requestToggle(node: RunNodeDto) {
    if (node.completedAt) {
      setPendingUncheck(node);
      return;
    }
    void toggleNode(node.id, true);
  }

  async function confirmUncheck() {
    if (!pendingUncheck) return;
    const node = pendingUncheck;
    setPendingUncheck(null);
    await toggleNode(node.id, false);
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
              {node.completedAt ? <Check size={13} /> : null}
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
            <div className="item-meta">
              {node.isParent ? (
                <span className="badge not-started">父节点 · 自动完成</span>
              ) : node.isRequired ? (
                <span className="badge high">必须</span>
              ) : (
                <span className="badge low">可选</span>
              )}
              {node.firstCompletedAt ? (
                <span>首次完成：{new Date(node.firstCompletedAt).toLocaleString("zh-CN")}</span>
              ) : null}
              {node.lastModifiedAt && node.lastModifiedAt !== node.firstCompletedAt ? (
                <span>上次修改：{new Date(node.lastModifiedAt).toLocaleString("zh-CN")}</span>
              ) : null}
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
          <Link href="/runs" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            <ArrowLeft size={15} /> 返回执行列表
          </Link>
          <h1 className="page-title">{run.templateName} <span style={{ color: "var(--muted)", fontWeight: 400 }}>/ {run.version}</span></h1>
          {run.templateDescription ? <p className="page-subtitle">{run.templateDescription}</p> : null}
        </div>
        <span className={`badge ${run.status === "COMPLETED" ? "completed" : run.status === "IN_PROGRESS" ? "progress" : "not-started"}`}>{statusText[run.status]}</span>
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
        <Modal title="确认取消完成？" onClose={() => setPendingUncheck(null)}>
          <div className="form-stack">
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.7 }}>
              将把“{pendingUncheck.name}”恢复为未完成状态，并重新计算父节点和 SOP
              状态。首次完成时间会保留，上次修改时间将更新为当前时间。
            </p>
            <div className="form-actions">
              <button className="button" type="button" onClick={() => setPendingUncheck(null)}>
                保持完成
              </button>
              <button
                className="button danger"
                disabled={busyId === pendingUncheck.id}
                type="button"
                onClick={() => void confirmUncheck()}
              >
                确认取消完成
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
