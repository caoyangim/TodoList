"use client";

import { useState } from "react";
import { LoadingSpinner } from "@/components/loading";
import { Modal } from "@/components/modal";
import {
  createTemplateNode,
  orderTemplateNodes,
  TemplateNodeEditor,
  TemplateNodeForm,
} from "@/features/templates/template-node-editor";
import { apiRequest, getApiErrorMessage } from "@/shared/api-client";
import { RunDto, TemplateDto } from "@/shared/types/models";

const customTemplateId = "__custom__";

export function RunCreateModal({
  templates,
  initialTemplateId,
  initialTitle,
  todoId,
  onClose,
  onCreated,
}: {
  templates: TemplateDto[];
  initialTemplateId?: string | null;
  initialTitle?: string;
  todoId?: string;
  onClose: () => void;
  onCreated: (run: RunDto) => void;
}) {
  const initialTemplate =
    templates.find((template) => template.id === initialTemplateId) ?? templates[0];
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? customTemplateId);
  const [title, setTitle] = useState(initialTitle ?? initialTemplate?.name ?? "");
  const [version, setVersion] = useState("");
  const [templateName, setTemplateName] = useState(initialTitle ?? "");
  const [templateDescription, setTemplateDescription] = useState("");
  const [nodes, setNodes] = useState<TemplateNodeForm[]>([createTemplateNode()]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const custom = templateId === customTemplateId;

  async function createRun(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const payload = custom
        ? {
            template: {
              name: templateName,
              description: templateDescription,
              nodes: orderTemplateNodes(nodes).map((node, index) => ({
                ...node,
                sortOrder: index + 1,
              })),
            },
            title,
            version,
            ...(todoId ? { todoId } : {}),
          }
        : {
            templateId,
            title,
            version,
            ...(todoId ? { todoId } : {}),
          };
      onCreated(
        await apiRequest<RunDto>("/api/runs", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "创建失败"));
      setCreating(false);
    }
  }

  return (
    <Modal
      title="创建 SOP 执行"
      className="run-create-modal"
      onClose={() => !creating && onClose()}
    >
      <form className="form-stack run-create-form" onSubmit={createRun}>
        {error ? <div className="error-banner">{error}</div> : null}
        <div className="field">
          <label htmlFor="run-template">SOP 模板</label>
          <select
            id="run-template"
            className="select"
            required
            value={templateId}
            onChange={(event) => {
              const nextTemplateId = event.target.value;
              setTemplateId(nextTemplateId);
              const nextTemplate = templates.find(
                (template) => template.id === nextTemplateId,
              );
              if (nextTemplate && !initialTitle) setTitle(nextTemplate.name);
              if (nextTemplateId === customTemplateId && initialTitle) {
                setTemplateName(initialTitle);
              }
            }}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}（{template.nodeCount} 个节点）
              </option>
            ))}
            <option value={customTemplateId}>自定义模板</option>
          </select>
        </div>

        {custom ? (
          <>
            <div className="field">
              <label htmlFor="custom-template-name">模板名称</label>
              <input
                id="custom-template-name"
                className="input"
                autoFocus
                maxLength={100}
                required
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="例如：APP 发布流程"
              />
            </div>
            <div className="field">
              <label htmlFor="custom-template-description">模板说明</label>
              <textarea
                id="custom-template-description"
                className="textarea"
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
                placeholder="简单说明这个流程的用途"
              />
            </div>
            <TemplateNodeEditor nodes={nodes} onChange={setNodes} />
          </>
        ) : null}

        <div className="field">
          <label htmlFor="run-title">执行标题</label>
          <input
            id="run-title"
            className="input"
            autoFocus={!custom}
            required
            maxLength={100}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：Android 6 月正式版发布"
          />
        </div>
        <div className="field">
          <label htmlFor="run-version">版本号</label>
          <input
            id="run-version"
            className="input"
            maxLength={50}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="例如：1.0.0（可选）"
          />
        </div>
        <div className="form-actions">
          <button className="button" disabled={creating} type="button" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={creating} type="submit">
            {creating ? (
              <>
                <LoadingSpinner /> 创建中...
              </>
            ) : (
              "创建并开始"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
