import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDir = path.resolve(process.cwd(), "data-test");
const testDb = path.join(testDir, "todoflow-test.db");
process.env.DATABASE_URL = `file:${testDb}`;
process.env.NOTE_FILE_DIR = path.join(testDir, "note-files");
process.env.TODOFLOW_ADMIN_USERNAME = "admin";
process.env.TODOFLOW_ADMIN_PASSWORD = "todoflow-test-password";

let rawTodoService: typeof import("@/server/services/todo-service").todoService;
let rawTemplateService: typeof import("@/server/services/template-service").templateService;
let rawRunService: typeof import("@/server/services/run-service").runService;
let rawNoteFileService: typeof import("@/server/services/note-file-service").noteFileService;
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

const noteFileService = {
  create: (file: File) => rawNoteFileService.create(testUserId, file),
  get: (id: string) => rawNoteFileService.get(testUserId, id),
  remove: (id: string) => rawNoteFileService.remove(testUserId, id),
};

beforeAll(async () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  ({ db } = await import("@/server/db"));
  ({ todoService: rawTodoService } = await import("@/server/services/todo-service"));
  ({ templateService: rawTemplateService } = await import("@/server/services/template-service"));
  ({ runService: rawRunService } = await import("@/server/services/run-service"));
  ({ noteFileService: rawNoteFileService } = await import("@/server/services/note-file-service"));
  ({ authService } = await import("@/server/services/auth-service"));
  testUserId = (
    db.prepare("SELECT id FROM User WHERE username = ?").get("admin") as { id: string }
  ).id;
});

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
    const user = authService.createUser(admin(), {
      username: "alice",
      password: "AlicePass123",
    });
    expect(user.mustChangePassword).toBe(true);

    const loggedIn = await authService.login(
      { username: "alice", password: "AlicePass123" },
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
      currentPassword: "AlicePass123",
      newPassword: "AliceNew1234",
    });
    expect(authService.authenticate(loggedIn.token)).toBeNull();

    const relogged = await authService.login(
      { username: "alice", password: "AliceNew1234" },
      "login-test",
    );
    expect(relogged.user.mustChangePassword).toBe(false);
  });

  it("isolates todos, templates, runs and files between users", async () => {
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
});
