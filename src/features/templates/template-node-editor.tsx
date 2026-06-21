"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";

export type TemplateNodeForm = {
  id: string;
  name: string;
  description: string;
  isRequired: boolean;
  noteRequired: boolean;
  parentId: string | null;
};

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTemplateNode(parentId: string | null = null): TemplateNodeForm {
  return {
    id: createClientId(),
    name: "",
    description: "",
    isRequired: true,
    noteRequired: false,
    parentId,
  };
}

export function orderTemplateNodes(nodes: TemplateNodeForm[]) {
  const roots = nodes.filter((node) => !node.parentId);
  return roots.flatMap((root) => [
    root,
    ...nodes.filter((node) => node.parentId === root.id),
  ]);
}

export function TemplateNodeEditor({
  nodes,
  onChange,
}: {
  nodes: TemplateNodeForm[];
  onChange: (nodes: TemplateNodeForm[]) => void;
}) {
  const roots = useMemo(() => nodes.filter((node) => !node.parentId), [nodes]);

  function childrenOf(parentId: string) {
    return nodes.filter((node) => node.parentId === parentId);
  }

  function updateNode(id: string, patch: Partial<TemplateNodeForm>) {
    onChange(nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)));
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
    onChange(next);
  }

  function removeNode(id: string) {
    const remaining = nodes.filter((node) => node.id !== id && node.parentId !== id);
    onChange(remaining.length ? remaining : [createTemplateNode()]);
  }

  function renderNode(node: TemplateNodeForm, siblingIndex: number, siblingCount: number) {
    const children = childrenOf(node.id);
    const isParent = children.length > 0;
    const isChild = Boolean(node.parentId);
    return (
      <div className={`tree-node ${isChild ? "child" : ""}`} key={node.id}>
        <div className="node-row">
          <span className="node-number">
            {isChild ? (
              <CornerDownRight size={16} />
            ) : (
              roots.findIndex((item) => item.id === node.id) + 1
            )}
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
                <>
                  <label className="required-toggle">
                    <input
                      checked={node.isRequired}
                      type="checkbox"
                      onChange={(event) =>
                        updateNode(node.id, { isRequired: event.target.checked })
                      }
                    />
                    必须完成
                  </label>
                  <label className="required-toggle">
                    <input
                      checked={node.noteRequired}
                      type="checkbox"
                      onChange={(event) =>
                        updateNode(node.id, { noteRequired: event.target.checked })
                      }
                    />
                    需要必填备注才能完成
                  </label>
                </>
              )}
              {!isChild ? (
                <button
                  className="inline-action"
                  type="button"
                  onClick={() => onChange([...nodes, createTemplateNode(node.id)])}
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

  return (
    <div>
      <div className="page-header compact-page-header">
        <div>
          <h2 className="section-title">执行节点</h2>
          <p className="page-subtitle">可选节点不阻止整个 SOP 完成。</p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => onChange([...nodes, createTemplateNode()])}
        >
          <Plus size={16} /> 添加顶层节点
        </button>
      </div>
      <div className="node-editor">
        {roots.map((node, index) => renderNode(node, index, roots.length))}
      </div>
    </div>
  );
}
