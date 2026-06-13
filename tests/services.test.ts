import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDir = path.resolve(process.cwd(), "data-test");
const testDb = path.join(testDir, "todoflow-test.db");
process.env.DATABASE_URL = `file:${testDb}`;
process.env.NOTE_IMAGE_DIR = path.join(testDir, "note-images");

let todoService: typeof import("@/server/services/todo-service").todoService;
let templateService: typeof import("@/server/services/template-service").templateService;
let runService: typeof import("@/server/services/run-service").runService;
let noteImageService: typeof import("@/server/services/note-image-service").noteImageService;
let db: typeof import("@/server/db").db;

beforeAll(async () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  ({ db } = await import("@/server/db"));
  ({ todoService } = await import("@/server/services/todo-service"));
  ({ templateService } = await import("@/server/services/template-service"));
  ({ runService } = await import("@/server/services/run-service"));
  ({ noteImageService } = await import("@/server/services/note-image-service"));
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

  it("stores rich Todo notes without changing completion", async () => {
    const image = await noteImageService.create(
      new File([new Uint8Array([137, 80, 78, 71])], "todo-note.png", {
        type: "image/png",
      }),
    );
    const todo = await todoService.create({
      title: "补充发布说明",
      description: "",
      priority: "MEDIUM",
      dueAt: null,
    });

    const noted = await todoService.setNote(todo.id, {
      note: {
        html: '<p>查看 <a href="https://example.com">发布文档</a><script>alert(1)</script></p>',
        imageIds: [image.id],
      },
    });
    expect(noted.note).toEqual({
      html:
        '<p>查看 <a href="https://example.com" target="_blank" rel="noreferrer noopener">发布文档</a></p>',
      images: [image],
    });
    expect(noted.completedAt).toBeNull();

    const cleared = await todoService.setNote(todo.id, {
      note: { html: "<p><br></p>", imageIds: [] },
    });
    expect(cleared.note).toBeNull();
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
    const run = await runService.create({
      templateId: template.id,
      title: "发布流程首版",
      version: "1.0.0",
    });

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
      runService.create({ templateId: template.id, title: "重复版本", version: "1.0.0" }),
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
    const run = await runService.create({
      templateId: template.id,
      title: "父子节点执行",
      version: "2.0.0",
    });
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
    expect(requiredDone.progressPercent).toBe(100);
    expect(requiredDone.nodes.find((node) => node.isParent)?.completedAt).toBeNull();

    const allChildrenDone = await runService.setNodeCompletion(run.id, optionalChild!.id, true);
    expect(allChildrenDone.progressPercent).toBe(100);
    expect(allChildrenDone.nodes.find((node) => node.isParent)?.completedAt).toBeTruthy();

    const optionalReopened = await runService.setNodeCompletion(run.id, optionalChild!.id, false);
    expect(optionalReopened.status).toBe("COMPLETED");
    expect(optionalReopened.nodes.find((node) => node.isParent)?.completedAt).toBeNull();
  });

  it("archives, restores and permanently deletes a run with its nodes", async () => {
    const template = await templateService.create({
      name: "可归档流程",
      description: "",
      nodes: [{ name: "执行节点", description: "", sortOrder: 1 }],
    });
    const run = await runService.create({
      templateId: template.id,
      title: "可归档执行",
      version: "1.0.0",
    });

    const archived = await runService.setArchived(run.id, { archived: true });
    expect(archived.archivedAt).toBeTruthy();

    const restored = await runService.setArchived(run.id, { archived: false });
    expect(restored.archivedAt).toBeNull();

    await runService.remove(run.id);
    await expect(runService.get(run.id)).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
      status: 404,
    });
    const nodeCount = db
      .prepare("SELECT COUNT(*) AS count FROM SopRunNode WHERE runId = ?")
      .get(run.id) as { count: number };
    expect(nodeCount.count).toBe(0);
    expect((await templateService.get(template.id)).hasRuns).toBe(false);
  });

  it("adds, updates and clears notes without changing node completion state", async () => {
    const template = await templateService.create({
      name: "带备注流程",
      description: "",
      nodes: [{ name: "检查结果", description: "", sortOrder: 1 }],
    });
    const run = await runService.create({
      templateId: template.id,
      title: "备注功能执行",
      version: "1.0.0",
    });
    const node = run.nodes[0];

    const noted = await runService.setNodeNote(run.id, node.id, {
      note: {
        html: "<p>已核对<strong>日志</strong>，查看 <a href=\"https://example.com\">详情</a></p>",
        imageIds: [],
      },
    });
    expect(noted.nodes[0].note).toEqual({
      html:
        '<p>已核对<strong>日志</strong>，查看 <a href="https://example.com" target="_blank" rel="noreferrer noopener">详情</a></p>',
      images: [],
    });
    expect(noted.nodes[0].completedAt).toBeNull();
    expect(noted.status).toBe("NOT_STARTED");

    const cleared = await runService.setNodeNote(run.id, node.id, {
      note: { html: "<p><br></p>", imageIds: [] },
    });
    expect(cleared.nodes[0].note).toBeNull();
    expect(cleared.nodes[0].lastModifiedAt).toBeNull();

    await expect(
      runService.setNodeNote(run.id, node.id, {
        note: { html: `<p>${"a".repeat(2001)}</p>`, imageIds: [] },
      }),
    ).rejects.toMatchObject({ code: "NOTE_TOO_LONG" });

    const sanitized = await runService.setNodeNote(run.id, node.id, {
      note: {
        html: '<p onclick="alert(1)">安全<script>alert(1)</script><a href="javascript:alert(1)">链接</a></p>',
        imageIds: [],
      },
    });
    expect(sanitized.nodes[0].note?.html).toBe(
      '<p>安全<a target="_blank" rel="noreferrer noopener">链接</a></p>',
    );
  });

  it("stores pasted note images and returns image references in notes", async () => {
    const image = await noteImageService.create(
      new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", {
        type: "image/png",
      }),
    );
    const template = await templateService.create({
      name: "图片备注流程",
      description: "",
      nodes: [{ name: "截图确认", description: "", sortOrder: 1 }],
    });
    const run = await runService.create({
      templateId: template.id,
      title: "图片备注执行",
      version: "1.0.0",
    });
    const updated = await runService.setNodeNote(run.id, run.nodes[0].id, {
      note: { html: "<p>见截图</p>", imageIds: [image.id] },
    });

    expect(updated.nodes[0].note?.html).toBe("<p>见截图</p>");
    expect(updated.nodes[0].note?.images).toEqual([image]);
    expect((await noteImageService.get(image.id)).bytes.length).toBe(4);
  });

  it("creates and updates an independent run title", async () => {
    const template = await templateService.create({
      name: "上线流程",
      description: "",
      nodes: [{ name: "发布", description: "", sortOrder: 1 }],
    });
    const run = await runService.create({
      templateId: template.id,
      title: "Android 6 月正式版发布",
      version: "3.0.0",
    });
    expect(run.title).toBe("Android 6 月正式版发布");

    const renamed = await runService.setTitle(run.id, { title: "Android 6 月补丁版发布" });
    expect(renamed.title).toBe("Android 6 月补丁版发布");
    expect(renamed.templateName).toBe("上线流程");
    expect(renamed.version).toBe("3.0.0");
    expect(renamed.nodes[0].name).toBe("发布");
  });
});
