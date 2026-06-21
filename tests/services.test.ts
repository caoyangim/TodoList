import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NoteDocumentDto } from "@/shared/note-document";

const testDir = path.resolve(process.cwd(), "data-test");
const testDb = path.join(testDir, "todoflow-test.db");
process.env.DATABASE_URL = `file:${testDb}`;
process.env.NOTE_FILE_DIR = path.join(testDir, "note-files");
process.env.NOTE_IMAGE_DIR = path.join(testDir, "note-images");
process.env.TODOFLOW_ADMIN_USERNAME = "admin";
process.env.TODOFLOW_ADMIN_PASSWORD = "todoflow-test-password";

let rawTodoService: typeof import("@/server/services/todo-service").todoService;
let rawTemplateService: typeof import("@/server/services/template-service").templateService;
let rawRunService: typeof import("@/server/services/run-service").runService;
let rawNoteService: typeof import("@/server/services/note-service").noteService;
let rawNoteFileService: typeof import("@/server/services/note-file-service").noteFileService;
let rawNoteImageService: typeof import("@/server/services/note-image-service").noteImageService;
let authService: typeof import("@/server/services/auth-service").authService;
let db: typeof import("@/server/db").db;
let testUserId: string;

const todoService = {
  list: (status?: unknown) => rawTodoService.list(testUserId, status),
  get: (id: string) => rawTodoService.get(testUserId, id),
  create: (input: unknown) => rawTodoService.create(testUserId, input),
  update: (id: string, input: unknown) => rawTodoService.update(testUserId, id, input),
  remove: (id: string) => rawTodoService.remove(testUserId, id),
  setNote: (id: string, input: unknown) => rawTodoService.setNote(testUserId, id, input),
  setStatus: (id: string, input: unknown) => rawTodoService.setStatus(testUserId, id, input),
};

const templateService = {
  list: () => rawTemplateService.list(testUserId),
  get: (id: string) => rawTemplateService.get(testUserId, id),
  create: (input: unknown) => rawTemplateService.create(testUserId, input),
  update: (id: string, input: unknown) => rawTemplateService.update(testUserId, id, input),
  remove: (id: string) => rawTemplateService.remove(testUserId, id),
};

const runService = {
  list: () => rawRunService.list(testUserId),
  get: (id: string) => rawRunService.get(testUserId, id),
  create: (input: unknown) => rawRunService.create(testUserId, input),
  setNodeCompletion: (runId: string, nodeId: string, completed: boolean) =>
    rawRunService.setNodeCompletion(testUserId, runId, nodeId, completed),
  setNodeNote: (runId: string, nodeId: string, input: unknown) =>
    rawRunService.setNodeNote(testUserId, runId, nodeId, input),
  setArchived: (id: string, input: unknown) =>
    rawRunService.setArchived(testUserId, id, input),
  setTitle: (id: string, input: unknown) => rawRunService.setTitle(testUserId, id, input),
  remove: (id: string) => rawRunService.remove(testUserId, id),
};

const noteService = {
  list: () => rawNoteService.list(testUserId),
  get: (id: string) => rawNoteService.get(testUserId, id),
  create: (input: unknown) => rawNoteService.create(testUserId, input),
  update: (id: string, input: unknown) => rawNoteService.update(testUserId, id, input),
  remove: (id: string) => rawNoteService.remove(testUserId, id),
};

const noteFileService = {
  create: (file: File) => rawNoteFileService.create(testUserId, file),
  get: (id: string) => rawNoteFileService.get(testUserId, id),
  remove: (id: string) => rawNoteFileService.remove(testUserId, id),
};

function doc(text: string): NoteDocumentDto {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

beforeAll(async () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  ({ db } = await import("@/server/db"));
  ({ todoService: rawTodoService } = await import("@/server/services/todo-service"));
  ({ templateService: rawTemplateService } = await import("@/server/services/template-service"));
  ({ runService: rawRunService } = await import("@/server/services/run-service"));
  ({ noteService: rawNoteService } = await import("@/server/services/note-service"));
  ({ noteFileService: rawNoteFileService } = await import("@/server/services/note-file-service"));
  ({ noteImageService: rawNoteImageService } = await import("@/server/services/note-image-service"));
  ({ authService } = await import("@/server/services/auth-service"));
  testUserId = (
    db.prepare("SELECT id FROM User WHERE username = ?").get("admin") as { id: string }
  ).id;
}, 60000);

afterAll(() => {
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("Todo service", () => {
  it("moves a Todo through pending, resolved and completed states", async () => {
    const todo = await todoService.create({
      title: "验证本地数据",
      description: "",
      timePriority: "HIGH",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    expect(todo.status).toBe("PENDING");
    expect(todo.completedAt).toBeNull();
    expect(todo.timePriority).toBe("HIGH");
    expect(todo.importancePriority).toBe("MEDIUM");

    const resolved = await todoService.setStatus(todo.id, { status: "RESOLVED" });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.completedAt).toBeNull();

    const completed = await todoService.setStatus(todo.id, {
      status: "COMPLETED",
      verificationReport: {
        html: '<p>已验证通过 <a href="https://example.com">回归记录</a></p>',
        fileIds: [],
      },
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeTruthy();
    expect(completed.verificationReport?.html).toBe(
      '<p>已验证通过 <a href="https://example.com" target="_blank" rel="noreferrer noopener">回归记录</a></p>',
    );

    const reopened = await todoService.setStatus(todo.id, { status: "PENDING" });
    expect(reopened.status).toBe("PENDING");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.verificationReport).toBeNull();
  });

  it("rejects skipping verification and report misuse", async () => {
    const todo = await todoService.create({
      title: "修复登录样式",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });

    await expect(
      todoService.setStatus(todo.id, {
        status: "COMPLETED",
        verificationReport: { html: "<p>直接完成</p>", fileIds: [] },
      }),
    ).rejects.toMatchObject({ code: "TODO_STATUS_TRANSITION_INVALID", status: 409 });

    await expect(
      todoService.setStatus(todo.id, {
        status: "RESOLVED",
        verificationReport: { html: "<p>不该在这里提交</p>", fileIds: [] },
      }),
    ).rejects.toMatchObject({ code: "TODO_VERIFICATION_REPORT_INVALID", status: 409 });
  });

  it("stores rich Todo notes without changing completion", async () => {
    const file = await noteFileService.create(
      new File([new Uint8Array([137, 80, 78, 71])], "todo-note.png", {
        type: "image/png",
      }),
    );
    const todo = await todoService.create({
      title: "补充发布说明",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "HIGH",
      dueAt: null,
    });

    const noted = await todoService.setNote(todo.id, {
      note: {
        html: '<p>查看 <a href="https://example.com">发布文档</a><script>alert(1)</script></p>',
        fileIds: [file.id],
      },
    });
    expect(noted.note).toEqual({
      html:
        '<p>查看 <a href="https://example.com" target="_blank" rel="noreferrer noopener">发布文档</a></p>',
      files: [file],
    });
    expect(noted.status).toBe("PENDING");
    expect(noted.completedAt).toBeNull();

    const cleared = await todoService.setNote(todo.id, {
      note: { html: "<p><br></p>", fileIds: [] },
    });
    expect(cleared.note).toBeNull();
  });
});

describe("Note service", () => {
  it("creates, lists and reads document notes with safe HTML", async () => {
    const note = await noteService.create({
      title: "发布记录",
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "发布记录" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "已完成回归" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "文档", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "image",
            attrs: {
              src: "/api/note-images/test-image",
              alt: "回归截图",
              title: "回归截图",
            },
          },
          {
            type: "callout",
            attrs: {
              kind: "warning",
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "上线前请再次检查环境变量" }],
              },
            ],
          },
        ],
      },
    });

    expect(note.title).toBe("发布记录");
    expect(note.content).toMatchObject({
      type: "doc",
      content: expect.any(Array),
    });
    expect(note.contentHtml).toContain("<h1>发布记录</h1>");
    expect(note.contentHtml).toContain('href="https://example.com"');
    expect(note.contentHtml).toContain('target="_blank"');
    expect(note.contentHtml).toContain('rel="noreferrer noopener"');
    expect(note.contentHtml).toContain(">文档</a>");
    expect(note.contentHtml).toContain('src="/api/note-images/test-image"');
    expect(note.contentHtml).toContain('alt="回归截图"');
    expect(note.contentHtml).toContain('class="note-callout"');
    expect(note.contentHtml).toContain('data-callout-kind="warning"');
    expect(note.contentHtml).toContain("上线前请再次检查环境变量");
    expect(note.excerpt).toContain("发布记录");

    const summaries = await noteService.list();
    expect(summaries[0]).toMatchObject({
      id: note.id,
      title: "发布记录",
      excerpt: expect.any(String),
    });
    expect(summaries[0]).not.toHaveProperty("content");
    expect(await noteService.get(note.id)).toEqual(note);
  });

  it("derives titles, updates content and rejects oversized notes", async () => {
    const note = await noteService.create({
      title: "",
      content: doc("第一行内容"),
    });
    expect(note.title).toBe("第一行内容");

    const updated = await noteService.update(note.id, {
      title: "更新后的 Note",
      content: {
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "引用" }],
              },
            ],
          },
          {
            type: "codeBlock",
            content: [{ type: "text", text: "alert(1)" }],
          },
        ],
      },
    });
    expect(updated.title).toBe("更新后的 Note");
    expect(updated.contentHtml).toContain("<blockquote><p>引用</p></blockquote>");
    expect(updated.contentHtml).toContain("<pre><code>alert(1)</code></pre>");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(note.updatedAt).getTime(),
    );

    await expect(
      noteService.create({
        content: doc("a".repeat(100001)),
      }),
    ).rejects.toMatchObject({
      code: "NOTE_TOO_LONG",
    });
  });

  it("deletes notes and returns not found afterwards", async () => {
    const note = await noteService.create({
      title: "待删除",
      content: doc("删除测试"),
    });
    await noteService.remove(note.id);
    await expect(noteService.get(note.id)).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
    await expect(noteService.remove(note.id)).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });
});

describe("SOP service", () => {
  it("creates a custom template, run snapshot and Todo binding atomically", async () => {
    const todo = await todoService.create({
      title: "上线支付功能",
      description: "",
      timePriority: "HIGH",
      importancePriority: "HIGH",
      dueAt: null,
    });
    const run = await runService.create({
      template: {
        name: "支付上线流程",
        description: "从 Todo 创建",
        nodes: [
          {
            id: "parent",
            name: "上线准备",
            description: "",
            sortOrder: 1,
            isRequired: true,
            parentId: null,
          },
          {
            id: "child",
            name: "检查配置",
            description: "",
            sortOrder: 2,
            isRequired: true,
            parentId: "parent",
          },
        ],
      },
      title: todo.title,
      version: "",
      todoId: todo.id,
    });

    expect(run.templateName).toBe("支付上线流程");
    expect(run.nodes.map((node) => node.name)).toEqual(["上线准备", "检查配置"]);
    expect(run.nodes[1].parentId).toBe(run.nodes[0].id);
    expect((await todoService.get(todo.id)).run).toMatchObject({
      id: run.id,
      title: todo.title,
      progressPercent: 0,
    });

    const completed = await runService.setNodeCompletion(run.id, run.nodes[1].id, true);
    expect(completed.progressPercent).toBe(100);
    expect((await todoService.get(todo.id)).run).toMatchObject({
      status: "COMPLETED",
      progressPercent: 100,
    });
    expect((await todoService.get(todo.id)).status).toBe("PENDING");
  });

  it("rejects duplicate Todo binding without creating a custom template", async () => {
    const todo = await todoService.create({
      title: "重复绑定",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    const template = await templateService.create({
      name: "绑定模板",
      description: "",
      nodes: [{ name: "执行", description: "", sortOrder: 1 }],
    });
    await runService.create({
      templateId: template.id,
      title: "首次绑定",
      version: null,
      todoId: todo.id,
    });
    const templateCountBefore = (
      db.prepare("SELECT COUNT(*) AS count FROM SopTemplate WHERE userId = ?").get(testUserId) as {
        count: number;
      }
    ).count;

    await expect(
      runService.create({
        template: {
          name: "不应保存",
          description: "",
          nodes: [{ name: "节点", description: "", sortOrder: 1 }],
        },
        title: "再次绑定",
        version: null,
        todoId: todo.id,
      }),
    ).rejects.toMatchObject({ code: "TODO_RUN_ALREADY_BOUND", status: 409 });
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM SopTemplate WHERE userId = ?").get(testUserId) as {
          count: number;
        }
      ).count,
    ).toBe(templateCountBefore);
  });

  it("only unbinds the other resource when deleting a Todo or run", async () => {
    const template = await templateService.create({
      name: "解绑模板",
      description: "",
      nodes: [{ name: "节点", description: "", sortOrder: 1 }],
    });
    const todoForRunDelete = await todoService.create({
      title: "删除执行",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    const runForDelete = await runService.create({
      templateId: template.id,
      title: "待删除执行",
      version: null,
      todoId: todoForRunDelete.id,
    });
    await runService.remove(runForDelete.id);
    expect((await todoService.get(todoForRunDelete.id)).run).toBeNull();

    const todoForDelete = await todoService.create({
      title: "删除 Todo",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    const preservedRun = await runService.create({
      templateId: template.id,
      title: "保留执行",
      version: null,
      todoId: todoForDelete.id,
    });
    await todoService.remove(todoForDelete.id);
    expect((await runService.get(preservedRun.id)).title).toBe("保留执行");
  });

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

  it("allows duplicate or empty versions and updates run status", async () => {
    const template = await templateService.create({
      name: "多版本执行流程",
      description: "",
      nodes: [
        { name: "步骤一", description: "", sortOrder: 1 },
        { name: "步骤二", description: "", sortOrder: 2 },
      ],
    });
    const duplicateVersionRun = await runService.create({
      templateId: template.id,
      title: "重复版本",
      version: "1.0.0",
    });
    expect(duplicateVersionRun.version).toBe("1.0.0");

    const emptyVersionRun = await runService.create({
      templateId: template.id,
      title: "无版本执行",
      version: "",
    });
    expect(emptyVersionRun.version).toBeNull();

    const afterFirst = await runService.setNodeCompletion(
      duplicateVersionRun.id,
      duplicateVersionRun.nodes[0].id,
      true,
    );
    expect(afterFirst.status).toBe("IN_PROGRESS");
    expect(afterFirst.progressPercent).toBe(50);
    const firstCompletion = afterFirst.nodes[0].firstCompletedAt;
    expect(firstCompletion).toBeTruthy();
    expect(afterFirst.nodes[0].lastModifiedAt).toBe(firstCompletion);

    const afterSecond = await runService.setNodeCompletion(
      duplicateVersionRun.id,
      duplicateVersionRun.nodes[1].id,
      true,
    );
    expect(afterSecond.status).toBe("COMPLETED");
    expect(afterSecond.progressPercent).toBe(100);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const reopened = await runService.setNodeCompletion(
      duplicateVersionRun.id,
      duplicateVersionRun.nodes[0].id,
      false,
    );
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
        fileIds: [],
      },
    });
    expect(noted.nodes[0].note).toEqual({
      html:
        '<p>已核对<strong>日志</strong>，查看 <a href="https://example.com" target="_blank" rel="noreferrer noopener">详情</a></p>',
      files: [],
    });
    expect(noted.nodes[0].completedAt).toBeNull();
    expect(noted.status).toBe("NOT_STARTED");

    const cleared = await runService.setNodeNote(run.id, node.id, {
      note: { html: "<p><br></p>", fileIds: [] },
    });
    expect(cleared.nodes[0].note).toBeNull();
    expect(cleared.nodes[0].lastModifiedAt).toBeNull();

    await expect(
      runService.setNodeNote(run.id, node.id, {
        note: { html: `<p>${"a".repeat(2001)}</p>`, fileIds: [] },
      }),
    ).rejects.toMatchObject({ code: "NOTE_TOO_LONG" });

    const sanitized = await runService.setNodeNote(run.id, node.id, {
      note: {
        html: '<p onclick="alert(1)">安全<script>alert(1)</script><a href="javascript:alert(1)">链接</a></p>',
        fileIds: [],
      },
    });
    expect(sanitized.nodes[0].note?.html).toBe(
      '<p>安全<a target="_blank" rel="noreferrer noopener">链接</a></p>',
    );
  });

  it("stores pasted note files and returns file references in notes", async () => {
    const file = await noteFileService.create(
      new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", {
        type: "image/png",
      }),
    );
    const template = await templateService.create({
      name: "文件备注流程",
      description: "",
      nodes: [{ name: "截图确认", description: "", sortOrder: 1 }],
    });
    const run = await runService.create({
      templateId: template.id,
      title: "文件备注执行",
      version: "1.0.0",
    });
    const updated = await runService.setNodeNote(run.id, run.nodes[0].id, {
      note: { html: "<p>见截图</p>", fileIds: [file.id] },
    });

    expect(updated.nodes[0].note?.html).toBe("<p>见截图</p>");
    expect(updated.nodes[0].note?.files).toEqual([file]);
    expect((await noteFileService.get(file.id)).bytes.length).toBe(4);
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
      version: null,
    });
    expect(run.title).toBe("Android 6 月正式版发布");

    const renamed = await runService.setTitle(run.id, { title: "Android 6 月补丁版发布" });
    expect(renamed.title).toBe("Android 6 月补丁版发布");
    expect(renamed.templateName).toBe("上线流程");
    expect(renamed.version).toBeNull();
    expect(renamed.nodes[0].name).toBe("发布");
  });
});

describe("Authentication and data isolation", () => {
  const admin = () => ({
    id: testUserId,
    username: "admin",
    role: "ADMIN" as const,
    mustChangePassword: false,
  });

  it("creates a user, requires a password change and revokes old sessions", async () => {
    const releaseTemplate = await rawTemplateService.create(testUserId, {
      name: "APP 发布流程",
      description: "默认发布检查",
      nodes: [
        {
          id: "release-parent",
          name: "应用市场提审",
          description: "",
          sortOrder: 1,
          isRequired: true,
          parentId: null,
        },
        {
          id: "release-child",
          name: "市场提审",
          description: "",
          sortOrder: 2,
          isRequired: true,
          parentId: "release-parent",
        },
      ],
    });
    await rawTemplateService.create(testUserId, {
      name: "常规工作流",
      description: "默认工作检查",
      nodes: [
        {
          name: "明确目标",
          description: "",
          sortOrder: 1,
          isRequired: true,
          parentId: null,
        },
      ],
    });
    await rawTemplateService.create(testUserId, {
      name: "管理员私有模板",
      description: "",
      nodes: [
        {
          name: "不应分配",
          description: "",
          sortOrder: 1,
          isRequired: true,
          parentId: null,
        },
      ],
    });

    const user = authService.createUser(admin(), {
      username: "alice",
      password: "Alice6",
    });
    expect(user.mustChangePassword).toBe(true);

    const aliceTemplates = await rawTemplateService.list(user.id);
    expect(aliceTemplates.map((template) => template.name).sort()).toEqual([
      "APP 发布流程",
      "常规工作流",
    ]);
    const aliceReleaseTemplate = aliceTemplates.find(
      (template) => template.name === "APP 发布流程",
    )!;
    expect(aliceReleaseTemplate.id).not.toBe(releaseTemplate.id);
    expect(aliceReleaseTemplate.nodes.map((node) => node.id)).not.toEqual(
      releaseTemplate.nodes.map((node) => node.id),
    );
    expect(aliceReleaseTemplate.nodes[1].parentId).toBe(aliceReleaseTemplate.nodes[0].id);

    await rawTemplateService.update(user.id, aliceReleaseTemplate.id, {
      name: "Alice 发布流程",
      description: "",
      nodes: [
        {
          name: "Alice 自定义步骤",
          description: "",
          sortOrder: 1,
          isRequired: true,
          parentId: null,
        },
      ],
    });
    const aliceWorkflow = aliceTemplates.find(
      (template) => template.name === "常规工作流",
    )!;
    await rawTemplateService.remove(user.id, aliceWorkflow.id);
    expect((await rawTemplateService.get(testUserId, releaseTemplate.id)).name).toBe(
      "APP 发布流程",
    );
    expect((await rawTemplateService.list(user.id)).map((template) => template.name)).toEqual([
      "Alice 发布流程",
    ]);

    const loggedIn = await authService.login(
      { username: "alice", password: "Alice6" },
      "login-test",
    );
    expect(authService.authenticate(loggedIn.token)?.id).toBe(user.id);
    const sessionBefore = db
      .prepare("SELECT id, expiresAt FROM Session WHERE userId = ?")
      .get(user.id) as { id: string; expiresAt: string };
    db.prepare("UPDATE Session SET lastUsedAt = ? WHERE id = ?").run(
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      sessionBefore.id,
    );
    expect(authService.authenticate(loggedIn.token)?.id).toBe(user.id);
    const refreshedExpiry = (
      db.prepare("SELECT expiresAt FROM Session WHERE id = ?").get(sessionBefore.id) as {
        expiresAt: string;
      }
    ).expiresAt;
    expect(new Date(refreshedExpiry).getTime()).toBeGreaterThan(
      new Date(sessionBefore.expiresAt).getTime(),
    );

    authService.changePassword(user.id, {
      currentPassword: "Alice6",
      newPassword: "AliceNew7",
    });
    expect(authService.authenticate(loggedIn.token)).toBeNull();

    const relogged = await authService.login(
      { username: "alice", password: "AliceNew7" },
      "login-test",
    );
    expect(relogged.user.mustChangePassword).toBe(false);
  });

  it("isolates todos, templates, runs, notes and files between users", async () => {
    const alice = authService.listUsers(admin()).find((user) => user.username === "alice")!;
    const bob = authService.createUser(admin(), {
      username: "bob",
      password: "BobPass12345",
    });

    const aliceTodo = await rawTodoService.create(alice.id, {
      title: "Alice Todo",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    await rawTodoService.create(bob.id, {
      title: "Bob Todo",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    expect((await rawTodoService.list(alice.id, "all")).map((todo) => todo.title)).toContain(
      "Alice Todo",
    );
    expect((await rawTodoService.list(alice.id, "all")).map((todo) => todo.title)).not.toContain(
      "Bob Todo",
    );
    await expect(rawTodoService.get(bob.id, aliceTodo.id)).rejects.toMatchObject({ status: 404 });

    const template = await rawTemplateService.create(alice.id, {
      name: "Alice Template",
      description: null,
      nodes: [{ name: "Step", description: null, sortOrder: 1, isRequired: true, parentId: null }],
    });
    await expect(
      rawRunService.create(bob.id, {
        templateId: template.id,
        title: "Cross-user run",
        version: null,
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND", status: 404 });
    await expect(
      rawRunService.create(bob.id, {
        template: {
          name: "Cross-user Todo template",
          description: null,
          nodes: [
            {
              name: "Step",
              description: null,
              sortOrder: 1,
              isRequired: true,
              parentId: null,
            },
          ],
        },
        title: "Cross-user Todo run",
        version: null,
        todoId: aliceTodo.id,
      }),
    ).rejects.toMatchObject({ code: "TODO_NOT_FOUND", status: 404 });

    const file = await rawNoteFileService.create(
      alice.id,
      new File([new Uint8Array([1, 2, 3])], "private.txt", { type: "text/plain" }),
    );
    await expect(rawNoteFileService.get(bob.id, file.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      rawTodoService.setNote(bob.id, (await rawTodoService.list(bob.id, "all"))[0].id, {
        note: { html: "<p>cross user file</p>", fileIds: [file.id] },
      }),
    ).rejects.toMatchObject({ code: "NOTE_FILE_NOT_FOUND" });

    const aliceNote = await rawNoteService.create(alice.id, {
      title: "Alice Note",
      content: doc("private note"),
    });
    await rawNoteService.create(bob.id, {
      title: "Bob Note",
      content: doc("bob note"),
    });
    expect((await rawNoteService.list(alice.id)).map((note) => note.title)).toContain("Alice Note");
    expect((await rawNoteService.list(alice.id)).map((note) => note.title)).not.toContain("Bob Note");
    await expect(rawNoteService.get(bob.id, aliceNote.id)).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });

  it("revokes sessions when disabling users and prevents self-disable", async () => {
    const bob = authService.listUsers(admin()).find((user) => user.username === "bob")!;
    const session = await authService.login(
      { username: "bob", password: "BobPass12345" },
      "disable-test",
    );
    authService.updateUser(admin(), bob.id, { isActive: false });
    expect(authService.authenticate(session.token)).toBeNull();
    await expect(
      authService.login(
        { username: "bob", password: "BobPass12345" },
        "disable-test",
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(() => authService.updateUser(admin(), testUserId, { isActive: false })).toThrowError();
  });

  it("rate limits repeated failed login attempts", async () => {
    for (let index = 0; index < 8; index += 1) {
      await expect(
        authService.login(
          { username: "missing-user", password: "incorrect" },
          "rate-limit-test",
        ),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    await expect(
      authService.login(
        { username: "missing-user", password: "incorrect" },
        "rate-limit-test",
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RATE_LIMITED", status: 429 });
  });

  it("permanently deletes a user with all business data and attachment files", async () => {
    const user = authService.createUser(admin(), {
      username: "charlie",
      password: "Charlie7",
    });
    const otherUserCountBefore = (
      db.prepare("SELECT COUNT(*) AS count FROM Todo WHERE userId = ?").get(testUserId) as {
        count: number;
      }
    ).count;
    const todo = await rawTodoService.create(user.id, {
      title: "Delete with account",
      description: "",
      timePriority: "MEDIUM",
      importancePriority: "MEDIUM",
      dueAt: null,
    });
    const template = await rawTemplateService.create(user.id, {
      name: "Delete template",
      description: "",
      nodes: [
        {
          name: "Delete node",
          description: "",
          sortOrder: 1,
          isRequired: true,
          parentId: null,
        },
      ],
    });
    const run = await rawRunService.create(user.id, {
      templateId: template.id,
      title: "Delete run",
      version: null,
    });
    const note = await rawNoteService.create(user.id, {
      title: "Delete note",
      content: doc("account delete note"),
    });
    const file = await rawNoteFileService.create(
      user.id,
      new File([new Uint8Array([1, 2, 3])], "delete.txt", { type: "text/plain" }),
    );
    const image = await rawNoteImageService.create(
      user.id,
      new File([new Uint8Array([137, 80, 78, 71])], "delete.png", {
        type: "image/png",
      }),
    );
    const session = await authService.login(
      { username: user.username, password: "Charlie7" },
      "delete-account-test",
    );

    const filePath = path.join(testDir, "note-files", `${file.id}.txt`);
    const imagePath = path.join(testDir, "note-images", `${image.id}.png`);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(imagePath)).toBe(true);

    authService.deleteAccount(session.user);

    expect(authService.authenticate(session.token)).toBeNull();
    expect(db.prepare("SELECT id FROM User WHERE id = ?").get(user.id)).toBeUndefined();
    expect(db.prepare("SELECT id FROM Todo WHERE id = ?").get(todo.id)).toBeUndefined();
    expect(db.prepare("SELECT id FROM SopTemplate WHERE id = ?").get(template.id)).toBeUndefined();
    expect(db.prepare("SELECT id FROM SopRun WHERE id = ?").get(run.id)).toBeUndefined();
    expect(db.prepare("SELECT id FROM Note WHERE id = ?").get(note.id)).toBeUndefined();
    expect(db.prepare("SELECT id FROM NoteFile WHERE id = ?").get(file.id)).toBeUndefined();
    expect(db.prepare("SELECT id FROM NoteImage WHERE id = ?").get(image.id)).toBeUndefined();
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(imagePath)).toBe(false);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS count FROM Todo WHERE userId = ?").get(testUserId) as {
          count: number;
        }
      ).count,
    ).toBe(otherUserCountBefore);
  });

  it("rejects administrator account deletion", () => {
    expect(() => authService.deleteAccount(admin())).toThrowError(
      expect.objectContaining({
        code: "ADMIN_ACCOUNT_CANNOT_BE_DELETED",
        status: 409,
      }),
    );
    expect(db.prepare("SELECT id FROM User WHERE id = ?").get(testUserId)).toBeTruthy();
  });

  it("restores staged files when database deletion fails", async () => {
    const user = authService.createUser(admin(), {
      username: "delta",
      password: "Delta888",
    });
    const file = await rawNoteFileService.create(
      user.id,
      new File([new Uint8Array([4, 5, 6])], "restore.txt", { type: "text/plain" }),
    );
    const filePath = path.join(testDir, "note-files", `${file.id}.txt`);
    db.exec(`
      CREATE TRIGGER FailDeltaDelete
      BEFORE DELETE ON User
      WHEN OLD.id = '${user.id}'
      BEGIN
        SELECT RAISE(ABORT, 'forced account delete failure');
      END;
    `);

    try {
      expect(() => authService.deleteAccount(user)).toThrowError();
    } finally {
      db.exec("DROP TRIGGER IF EXISTS FailDeltaDelete");
    }

    expect(db.prepare("SELECT id FROM User WHERE id = ?").get(user.id)).toBeTruthy();
    expect(db.prepare("SELECT id FROM NoteFile WHERE id = ?").get(file.id)).toBeTruthy();
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("keeps the account unchanged when attachment staging fails", async () => {
    const user = authService.createUser(admin(), {
      username: "echo",
      password: "Echo999",
    });
    const file = await rawNoteFileService.create(
      user.id,
      new File([new Uint8Array([7, 8, 9])], "stage.txt", { type: "text/plain" }),
    );
    const rename = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("forced rename failure");
    });

    try {
      expect(() => authService.deleteAccount(user)).toThrowError("forced rename failure");
    } finally {
      rename.mockRestore();
    }

    expect(db.prepare("SELECT id FROM User WHERE id = ?").get(user.id)).toBeTruthy();
    expect(db.prepare("SELECT id FROM NoteFile WHERE id = ?").get(file.id)).toBeTruthy();
    expect(fs.existsSync(path.join(testDir, "note-files", `${file.id}.txt`))).toBe(true);
  });
});
