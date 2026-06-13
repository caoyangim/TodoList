"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ClipboardList, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import { apiRequest } from "@/shared/api-client";
import { TemplateDto } from "@/shared/types/models";

export function TemplateListPage() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      setTemplates(await apiRequest<TemplateDto[]>("/api/templates"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模板加载失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(template: TemplateDto) {
    if (!window.confirm(`确定删除模板“${template.name}”吗？`)) return;
    setBusyId(template.id);
    setError("");
    try {
      await apiRequest(`/api/templates/${template.id}`, { method: "DELETE" });
      await load(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">SOP 模板</h1>
          <p className="page-subtitle">把重复工作整理成可以反复使用的清单。</p>
        </div>
        <Link className="button primary" href="/templates/new"><Plus size={17} /> 新建模板</Link>
      </header>

      {error ? <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div> : null}
      {loading ? (
        <LoadingState label="正在加载模板..." />
      ) : templates.length === 0 ? (
        <EmptyState
          title="还没有 SOP 模板"
          description="创建一个模板，把经常重复的工作固定下来。"
          action={<Link className="button primary" href="/templates/new">新建模板</Link>}
        />
      ) : (
        <div className="card-grid">
          {templates.map((template) => (
            <article className="card" key={template.id}>
              <div className="card-header">
                <div>
                  <ClipboardList size={20} color="var(--accent)" />
                  <h2 className="item-title" style={{ marginTop: 12 }}>{template.name}</h2>
                </div>
                <button
                  aria-label="删除模板"
                  className="button ghost icon-only"
                  disabled={template.hasRuns || busyId === template.id}
                  onClick={() => void remove(template)}
                  title={template.hasRuns ? "已有执行记录，不能删除" : "删除模板"}
                >
                  {busyId === template.id ? <LoadingSpinner /> : <Trash2 size={16} />}
                </button>
              </div>
              {template.description ? <p className="item-description">{template.description}</p> : null}
              <div className="item-meta" style={{ marginTop: 18 }}>
                <span>{template.nodeCount} 个节点</span>
                <span>更新于 {new Date(template.updatedAt).toLocaleDateString("zh-CN")}</span>
              </div>
              <Link className="button" href={`/templates/${template.id}`} style={{ width: "100%", marginTop: 16 }}>
                编辑模板 <ChevronRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
