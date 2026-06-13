import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { templateInputSchema } from "@/shared/schemas/template";
import { TemplateDto, TemplateNodeDto } from "@/shared/types/models";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  runCount: number;
};

function getTemplate(id: string): TemplateDto | null {
  const template = db.prepare(`
    SELECT t.*, COUNT(r.id) AS runCount
    FROM SopTemplate t LEFT JOIN SopRun r ON r.templateId = t.id
    WHERE t.id = ? GROUP BY t.id
  `).get(id) as TemplateRow | undefined;
  if (!template) return null;
  const nodes = db
    .prepare("SELECT id, name, description, sortOrder, isRequired, parentId FROM SopTemplateNode WHERE templateId = ? ORDER BY sortOrder")
    .all(id) as (Omit<TemplateNodeDto, "isRequired"> & { isRequired: number })[];
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    nodes: nodes.map((node) => ({ ...node, isRequired: Boolean(node.isRequired) })),
    nodeCount: nodes.length,
    hasRuns: template.runCount > 0,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export const templateService = {
  async list() {
    const rows = db.prepare("SELECT id FROM SopTemplate ORDER BY updatedAt DESC").all() as { id: string }[];
    return rows.map((row) => getTemplate(row.id) as TemplateDto);
  },

  async get(id: string) {
    const template = getTemplate(id);
    if (!template) throw new AppError("TEMPLATE_NOT_FOUND", "SOP 模板不存在", 404);
    return template;
  },

  async create(input: unknown) {
    const data = templateInputSchema.parse(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("INSERT INTO SopTemplate (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
        .run(id, data.name, data.description, now, now);
      const insert = db.prepare(`
        INSERT INTO SopTemplateNode (
          id, templateId, name, description, sortOrder, isRequired, parentId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const assignedIds = data.nodes.map(() => randomUUID());
      const idMap = new Map(
        data.nodes.flatMap((node, index) => (node.id ? [[node.id, assignedIds[index]] as const] : [])),
      );
      data.nodes.forEach((node, index) => {
        insert.run(
          assignedIds[index],
          id,
          node.name,
          node.description,
          index + 1,
          node.isRequired ? 1 : 0,
          node.parentId ? idMap.get(node.parentId) ?? null : null,
          now,
          now,
        );
      });
    })();
    return this.get(id);
  },

  async update(id: string, input: unknown) {
    const data = templateInputSchema.parse(input);
    await this.get(id);
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE SopTemplate SET name = ?, description = ?, updatedAt = ? WHERE id = ?")
        .run(data.name, data.description, now, id);
      db.prepare("DELETE FROM SopTemplateNode WHERE templateId = ?").run(id);
      const insert = db.prepare(`
        INSERT INTO SopTemplateNode (
          id, templateId, name, description, sortOrder, isRequired, parentId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const assignedIds = data.nodes.map(() => randomUUID());
      const idMap = new Map(
        data.nodes.flatMap((node, index) => (node.id ? [[node.id, assignedIds[index]] as const] : [])),
      );
      data.nodes.forEach((node, index) => {
        insert.run(
          assignedIds[index],
          id,
          node.name,
          node.description,
          index + 1,
          node.isRequired ? 1 : 0,
          node.parentId ? idMap.get(node.parentId) ?? null : null,
          now,
          now,
        );
      });
    })();
    return this.get(id);
  },

  async remove(id: string) {
    const template = await this.get(id);
    if (template.hasRuns) {
      throw new AppError("TEMPLATE_IN_USE", "该模板已有执行记录，不能删除", 409);
    }
    db.prepare("DELETE FROM SopTemplate WHERE id = ?").run(id);
  },
};
