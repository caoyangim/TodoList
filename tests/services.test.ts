import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDir = path.resolve(process.cwd(), "data-test");
const testDb = path.join(testDir, "todoflow-test.db");
process.env.DATABASE_URL = `file:${testDb}`;

let todoService: typeof import("@/server/services/todo-service").todoService;
let templateService: typeof import("@/server/services/template-service").templateService;
let runService: typeof import("@/server/services/run-service").runService;
let db: typeof import("@/server/db").db;

beforeAll(async () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  ({ db } = await import("@/server/db"));
  ({ todoService } = await import("@/server/services/todo-service"));
  ({ templateService } = await import("@/server/services/template-service"));
  ({ runService } = await import("@/server/services/run-service"));
});

afterAll(() => {
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("Todo service", () => {
  it("creates, completes and reopens a Todo", async () => {
    const todo = await todoService.create({
      title: "验证本地数据",
      description: "",
      priority: "HIGH",
      dueAt: null,
    });
    expect(todo.completedAt).toBeNull();

    const completed = await todoService.setCompletion(todo.id, true);
    expect(completed.completedAt).toBeTruthy();

    const reopened = await todoService.setCompletion(todo.id, false);
    expect(reopened.completedAt).toBeNull();
  });
});

describe("SOP service", () => {
  it("keeps run snapshots independent from template edits", async () => {
    const template = await templateService.create({
      name: "发布流程",
      description: "首版",
      nodes: [
        { name: "构建", description: "", sortOrder: 1 },
        { name: "发布", description: "", sortOrder: 2 },
      ],
    });
    const run = await runService.create({ templateId: template.id, version: "1.0.0" });

    await templateService.update(template.id, {
      name: "新版发布流程",
      description: "第二版",
      nodes: [{ name: "全新节点", description: "", sortOrder: 1 }],
    });

    const historicalRun = await runService.get(run.id);
    expect(historicalRun.templateName).toBe("发布流程");
    expect(historicalRun.nodes.map((node) => node.name)).toEqual(["构建", "发布"]);
  });

  it("rejects duplicate versions and updates run status", async () => {
    const [template] = await templateService.list();
    await expect(
      runService.create({ templateId: template.id, version: "1.0.0" }),
    ).rejects.toMatchObject({ code: "VERSION_EXISTS", status: 409 });

    const [run] = await runService.list();
    const afterFirst = await runService.setNodeCompletion(run.id, run.nodes[0].id, true);
    expect(afterFirst.status).toBe("IN_PROGRESS");
    expect(afterFirst.progressPercent).toBe(50);
    const firstCompletion = afterFirst.nodes[0].firstCompletedAt;
    expect(firstCompletion).toBeTruthy();
    expect(afterFirst.nodes[0].lastModifiedAt).toBe(firstCompletion);

    const afterSecond = await runService.setNodeCompletion(run.id, run.nodes[1].id, true);
    expect(afterSecond.status).toBe("COMPLETED");
    expect(afterSecond.progressPercent).toBe(100);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const reopened = await runService.setNodeCompletion(run.id, run.nodes[0].id, false);
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.nodes[0].firstCompletedAt).toBe(firstCompletion);
    expect(reopened.nodes[0].lastModifiedAt).not.toBe(firstCompletion);
  });

  it("prevents deleting a template with runs", async () => {
    const [template] = await templateService.list();
    await expect(templateService.remove(template.id)).rejects.toMatchObject({
      code: "TEMPLATE_IN_USE",
      status: 409,
    });
  });

  it("supports optional nodes and derives parent completion from all children", async () => {
    const parentId = "parent-release";
    const requiredChildId = "child-required";
    const optionalChildId = "child-optional";
    const template = await templateService.create({
      name: "父子节点流程",
      description: "",
      nodes: [
        {
          id: parentId,
          name: "发布阶段",
          description: "",
          sortOrder: 1,
          isRequired: true,
          parentId: null,
        },
        {
          id: requiredChildId,
          name: "必须检查",
          description: "",
          sortOrder: 2,
          isRequired: true,
          parentId,
        },
        {
          id: optionalChildId,
          name: "可选检查",
          description: "",
          sortOrder: 3,
          isRequired: false,
          parentId,
        },
      ],
    });
    const run = await runService.create({ templateId: template.id, version: "2.0.0" });
    const parent = run.nodes.find((node) => node.isParent);
    const requiredChild = run.nodes.find((node) => node.name === "必须检查");
    const optionalChild = run.nodes.find((node) => node.name === "可选检查");

    expect(parent).toBeTruthy();
    expect(run.totalCount).toBe(2);
    expect(run.requiredTotalCount).toBe(1);
    await expect(
      runService.setNodeCompletion(run.id, parent!.id, true),
    ).rejects.toMatchObject({ code: "PARENT_NODE_READ_ONLY", status: 409 });

    const requiredDone = await runService.setNodeCompletion(run.id, requiredChild!.id, true);
    expect(requiredDone.status).toBe("COMPLETED");
    expect(requiredDone.progressPercent).toBe(50);
    expect(requiredDone.nodes.find((node) => node.isParent)?.completedAt).toBeNull();

    const allChildrenDone = await runService.setNodeCompletion(run.id, optionalChild!.id, true);
    expect(allChildrenDone.progressPercent).toBe(100);
    expect(allChildrenDone.nodes.find((node) => node.isParent)?.completedAt).toBeTruthy();

    const optionalReopened = await runService.setNodeCompletion(run.id, optionalChild!.id, false);
    expect(optionalReopened.status).toBe("COMPLETED");
    expect(optionalReopened.nodes.find((node) => node.isParent)?.completedAt).toBeNull();
  });
});
