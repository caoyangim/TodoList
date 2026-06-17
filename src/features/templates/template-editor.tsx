"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/shared/api-client";
import { TemplateDto } from "@/shared/types/models";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import {
  createTemplateNode,
  orderTemplateNodes,
  TemplateNodeEditor,
  TemplateNodeForm,
} from "@/features/templates/template-node-editor";

export function TemplateEditor({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<TemplateNodeForm[]>([createTemplateNode()]);
  const [loading, setLoading] = useState(Boolean(templateId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!templateId) return;
    apiRequest<TemplateDto>(`/api/templates/${templateId}`)
      .then((template) => {
        setName(template.name);
        setDescription(template.description ?? "");
        setNodes(
          template.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            description: node.description ?? "",
            isRequired: node.isRequired,
            noteRequired: node.noteRequired,
            parentId: node.parentId,
          })),
        );
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "模板加载失败"),
      )
      .finally(() => setLoading(false));
  }, [templateId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        description,
        nodes: orderTemplateNodes(nodes).map((node, index) => ({
          ...node,
          sortOrder: index + 1,
        })),
      };
      if (templateId) {
        await apiRequest(`/api/templates/${templateId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      router.push("/templates");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="正在加载模板..." />;

  return (
    <>
      <header className="page-header">
        <div>
          <Link
            href="/templates"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "var(--muted)",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            <ArrowLeft size={15} /> 返回模板列表
          </Link>
          <h1 className="page-title">{templateId ? "编辑 SOP 模板" : "新建 SOP 模板"}</h1>
          <p className="page-subtitle">支持两层父子结构；父节点由全部子节点自动完成。</p>
        </div>
      </header>

      <form className="form-stack" onSubmit={save}>
        {error ? <div className="error-banner">{error}</div> : null}
        <div className="card form-stack">
          <div className="field">
            <label htmlFor="template-name">模板名称</label>
            <input
              id="template-name"
              className="input"
              autoFocus
              maxLength={100}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：APP 发布流程"
            />
          </div>
          <div className="field">
            <label htmlFor="template-description">模板说明</label>
            <textarea
              id="template-description"
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="简单说明这个流程的用途"
            />
          </div>
        </div>

        <TemplateNodeEditor nodes={nodes} onChange={setNodes} />

        <div className="form-actions">
          <Link
            aria-disabled={saving}
            className={`button ${saving ? "disabled" : ""}`}
            href={saving ? "#" : "/templates"}
            onClick={(event) => saving && event.preventDefault()}
          >
            取消
          </Link>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? <><LoadingSpinner /> 保存中...</> : "保存模板"}
          </button>
        </div>
      </form>
    </>
  );
}
