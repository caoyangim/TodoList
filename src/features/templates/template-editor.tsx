"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/shared/api-client";
import { TemplateDto } from "@/shared/types/models";

type NodeForm = {
  id: string;
  name: string;
  description: string;
  isRequired: boolean;
  parentId: string | null;
};

function newNode(parentId: string | null = null): NodeForm {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    isRequired: true,
    parentId,
  };
}

export function TemplateEditor({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<NodeForm[]>([newNode()]);
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
            parentId: node.parentId,
          })),
        );
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "模板加载失败"),
      )
      .finally(() => setLoading(false));
  }, [templateId]);

  const roots = useMemo(() => nodes.filter((node) => !node.parentId), [nodes]);

  function childrenOf(parentId: string) {
    return nodes.filter((node) => node.parentId === parentId);
  }

  function updateNode(id: string, patch: Partial<NodeForm>) {
    setNodes(nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  }

  function moveNode(id: string, direction: -1 | 1) {
    const current = nodes.find((node) => node.id === id);
    if (!current) return;
    const siblings = nodes.filter((node) => node.parentId === current.parentId);
    const index = siblings.findIndex((node) => node.id === id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const firstIndex = nodes.findIndex((node) => node.id === siblings[index].id);
    const secondIndex = nodes.findIndex((node) => node.id === siblings[target].id);
    const next = [...nodes];
    [next[firstIndex], next[secondIndex]] = [next[secondIndex], next[firstIndex]];
    setNodes(next);
  }

  function removeNode(id: string) {
    const remaining = nodes.filter((node) => node.id !== id && node.parentId !== id);
    setNodes(remaining.length ? remaining : [newNode()]);
  }

  function orderedNodes() {
    return roots.flatMap((root) => [root, ...childrenOf(root.id)]);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        description,
        nodes: orderedNodes().map((node, index) => ({ ...node, sortOrder: index + 1 })),
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

  function renderNode(node: NodeForm, siblingIndex: number, siblingCount: number) {
    const children = childrenOf(node.id);
    const isParent = children.length > 0;
    const isChild = Boolean(node.parentId);
    return (
      <div className={`tree-node ${isChild ? "child" : ""}`} key={node.id}>
        <div className="node-row">
          <span className="node-number">
            {isChild ? <CornerDownRight size={16} /> : roots.findIndex((item) => item.id === node.id) + 1}
          </span>
          <div className="node-fields">
            <div className="form-row">
              <input
                className="input"
                required
                maxLength={100}
                value={node.name}
                onChange={(event) => updateNode(node.id, { name: event.target.value })}
                placeholder={isParent ? "父节点名称" : "节点名称"}
              />
              <input
                className="input"
                value={node.description}
                onChange={(event) => updateNode(node.id, { description: event.target.value })}
                placeholder="节点说明（可选）"
              />
            </div>
            <div className="node-options">
              {isParent ? (
                <span className="badge not-started">父节点 · 自动完成</span>
              ) : (
                <label className="required-toggle">
                  <input
                    checked={node.isRequired}
                    type="checkbox"
                    onChange={(event) => updateNode(node.id, { isRequired: event.target.checked })}
                  />
                  必须完成
                </label>
              )}
              {!isChild ? (
                <button
                  className="inline-action"
                  type="button"
                  onClick={() => setNodes([...nodes, newNode(node.id)])}
                >
                  <Plus size={14} /> 添加子节点
                </button>
              ) : null}
            </div>
          </div>
          <div className="node-actions">
            <button
              aria-label="上移"
              className="button ghost icon-only"
              disabled={siblingIndex === 0}
              type="button"
              onClick={() => moveNode(node.id, -1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              aria-label="下移"
              className="button ghost icon-only"
              disabled={siblingIndex === siblingCount - 1}
              type="button"
              onClick={() => moveNode(node.id, 1)}
            >
              <ArrowDown size={15} />
            </button>
            <button
              aria-label="删除节点"
              className="button ghost icon-only"
              type="button"
              onClick={() => removeNode(node.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        {children.length ? (
          <div className="tree-children">
            {children.map((child, index) => renderNode(child, index, children.length))}
          </div>
        ) : null}
      </div>
    );
  }

  if (loading) return <div className="loading">正在加载模板...</div>;

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

        <div>
          <div className="page-header" style={{ marginBottom: 12, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>执行节点</h2>
              <p className="page-subtitle">可选节点不阻止整个 SOP 完成。</p>
            </div>
            <button
              className="button"
              type="button"
              onClick={() => setNodes([...nodes, newNode()])}
            >
              <Plus size={16} /> 添加顶层节点
            </button>
          </div>
          <div className="node-editor">
            {roots.map((node, index) => renderNode(node, index, roots.length))}
          </div>
        </div>

        <div className="form-actions">
          <Link className="button" href="/templates">取消</Link>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? "保存中..." : "保存模板"}
          </button>
        </div>
      </form>
    </>
  );
}
