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

function getTemplate(userId: string, id: string): TemplateDto | null {
  const template = db.prepare(`
    SELECT t.*, COUNT(r.id) AS runCount
    FROM SopTemplate t LEFT JOIN SopRun r ON r.templateId = t.id
    WHERE t.id = ? AND t.userId = ? GROUP BY t.id
  `).get(id, userId) as TemplateRow | undefined;
  if (!template) return null;
  const nodes = db
    .prepare("SELECT id, name, description, sortOrder, isRequired, noteRequired, parentId FROM SopTemplateNode WHERE templateId = ? ORDER BY sortOrder")
    .all(id) as (Omit<TemplateNodeDto, "isRequired" | "noteRequired"> & { isRequired: number; noteRequired: number })[];
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    nodes: nodes.map((node) => ({ ...node, isRequired: Boolean(node.isRequired), noteRequired: Boolean(node.noteRequired) })),
    nodeCount: nodes.length,
    hasRuns: template.runCount > 0,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export const templateService = {
  async list(userId: string) {
    const rows = db.prepare("SELECT id FROM SopTemplate WHERE userId = ? ORDER BY updatedAt DESC").all(userId) as { id: string }[];
    return rows.map((row) => getTemplate(userId, row.id) as TemplateDto);
  },

  async get(userId: string, id: string) {
    const template = getTemplate(userId, id);
    if (!template) throw new AppError("TEMPLATE_NOT_FOUND", "SOP 模板不存在", 404);
    return template;
  },

  async create(userId: string, input: unknown) {
    const data = templateInputSchema.parse(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, userId, data.name, data.description, now, now);
      const insert = db.prepare(`
        INSERT INTO SopTemplateNode (
          id, templateId, name, description, sortOrder, isRequired, noteRequired, parentId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          node.noteRequired ? 1 : 0,
          node.parentId ? idMap.get(node.parentId) ?? null : null,
          now,
          now,
        );
      });
    })();
    return this.get(userId, id);
  },

  async update(userId: string, id: string, input: unknown) {
    const data = templateInputSchema.parse(input);
    await this.get(userId, id);
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE SopTemplate SET name = ?, description = ?, updatedAt = ? WHERE id = ? AND userId = ?")
        .run(data.name, data.description, now, id, userId);
      db.prepare("DELETE FROM SopTemplateNode WHERE templateId = ?").run(id);
      const insert = db.prepare(`
        INSERT INTO SopTemplateNode (
          id, templateId, name, description, sortOrder, isRequired, noteRequired, parentId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          node.noteRequired ? 1 : 0,
          node.parentId ? idMap.get(node.parentId) ?? null : null,
          now,
          now,
        );
      });
    })();
    return this.get(userId, id);
  },

  async remove(userId: string, id: string) {
    const template = await this.get(userId, id);
    if (template.hasRuns) {
      throw new AppError("TEMPLATE_IN_USE", "该模板已有执行记录，不能删除", 409);
    }
    db.prepare("DELETE FROM SopTemplate WHERE id = ? AND userId = ?").run(id, userId);
  },
};
