"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ListChecks, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { apiRequest } from "@/shared/api-client";
import { RunDto, TemplateDto } from "@/shared/types/models";

const statusText = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
};

export function RunListPage() {
  const [runs, setRuns] = useState<RunDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [version, setVersion] = useState("");
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
      if (!templateId && templateData[0]) setTemplateId(templateData[0].id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "执行记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
    // Initial load only; templateId is initialized from the response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRun(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const run = await apiRequest<RunDto>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ templateId, version }),
      });
      setOpen(false);
      setVersion("");
      window.location.href = `/runs/${run.id}`;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">SOP 执行</h1>
          <p className="page-subtitle">从模板开始一次独立、可追踪的执行。</p>
        </div>
        <button className="button primary" disabled={templates.length === 0 && !loading} onClick={() => { setError(""); setOpen(true); }}>
          <Plus size={17} /> 创建执行
        </button>
      </header>

      {error && !open ? <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div> : null}
      {loading ? (
        <div className="loading">正在加载...</div>
      ) : runs.length === 0 ? (
        <EmptyState
          title={templates.length ? "还没有执行记录" : "请先创建 SOP 模板"}
          description={templates.length ? "选择一个模板，开始第一次执行。" : "执行实例需要从一个包含节点的模板创建。"}
          action={templates.length ? <button className="button primary" onClick={() => setOpen(true)}>创建执行</button> : <Link className="button primary" href="/templates/new">新建模板</Link>}
        />
      ) : (
        <div className="list">
          {runs.map((run) => (
            <Link className="list-item" href={`/runs/${run.id}`} key={run.id}>
              <ListChecks size={20} color="var(--accent)" />
              <div className="list-item-main">
                <h2 className="item-title">{run.templateName} <span style={{ color: "var(--muted)", fontWeight: 400 }}>/ {run.version}</span></h2>
                <div className="item-meta">
                  <span className={`badge ${run.status === "COMPLETED" ? "completed" : run.status === "IN_PROGRESS" ? "progress" : "not-started"}`}>{statusText[run.status]}</span>
                  <span>
                    {run.completedCount}/{run.totalCount} 个执行节点
                    {run.requiredTotalCount > 0
                      ? ` · 必须 ${run.requiredCompletedCount}/${run.requiredTotalCount}`
                      : ""}
                  </span>
                  <span>更新于 {new Date(run.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="progress-track" style={{ marginTop: 12 }}>
                  <div className="progress-bar" style={{ width: `${run.progressPercent}%` }} />
                </div>
              </div>
              <ChevronRight size={18} color="var(--muted)" />
            </Link>
          ))}
        </div>
      )}

      {open ? (
        <Modal title="创建 SOP 执行" onClose={() => setOpen(false)}>
          <form className="form-stack" onSubmit={createRun}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label htmlFor="run-template">SOP 模板</label>
              <select id="run-template" className="select" required value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}（{template.nodeCount} 个节点）</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="run-version">版本号</label>
              <input id="run-version" className="input" autoFocus required maxLength={50} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如：1.0.0" />
            </div>
            <div className="form-actions">
              <button className="button" type="button" onClick={() => setOpen(false)}>取消</button>
              <button className="button primary" disabled={creating} type="submit">{creating ? "创建中..." : "创建并开始"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
