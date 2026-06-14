import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  updateUserSchema,
} from "@/shared/schemas/auth";
import { AdminUserDto, CurrentUserDto, UserRole } from "@/shared/types/models";

const sessionDurationMs = 90 * 24 * 60 * 60 * 1000;
const sessionRefreshIntervalMs = 24 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 8;
const dummyPasswordHash = hashPassword("todoflow-dummy-password");

type UserRow = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: number;
  mustChangePassword: number;
  createdAt: string;
  updatedAt: string;
};

type Attempt = { count: number; resetAt: number };
const loginAttempts = new Map<string, Attempt>();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toCurrentUser(row: UserRow): CurrentUserDto {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: Boolean(row.mustChangePassword),
  };
}

function toAdminUser(row: UserRow): AdminUserDto {
  return {
    ...toCurrentUser(row),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getUserById(id: string) {
  return db.prepare("SELECT * FROM User WHERE id = ?").get(id) as UserRow | undefined;
}

function assertAdmin(actor: CurrentUserDto) {
  if (actor.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "没有管理员权限", 403);
  }
}

function checkLoginLimit(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.delete(key);
    return;
  }
  if (attempt.count >= maxLoginAttempts) {
    throw new AppError("LOGIN_RATE_LIMITED", "登录尝试过于频繁，请稍后再试", 429);
  }
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return;
  }
  attempt.count += 1;
}

export const authService = {
  async login(input: unknown, clientKey: string) {
    const data = loginSchema.parse(input);
    const attemptKey = `${clientKey}:${data.username}`;
    checkLoginLimit(attemptKey);

    const user = db.prepare("SELECT * FROM User WHERE username = ?").get(data.username) as
      | UserRow
      | undefined;
    const passwordMatches = verifyPassword(data.password, user?.passwordHash ?? dummyPasswordHash);
    if (!user || !user.isActive || !passwordMatches) {
      recordLoginFailure(attemptKey);
      throw new AppError("INVALID_CREDENTIALS", "用户名或密码不正确", 401);
    }

    loginAttempts.delete(attemptKey);
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    db.prepare(`
      INSERT INTO Session (id, userId, tokenHash, expiresAt, lastUsedAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      user.id,
      hashToken(token),
      new Date(now.getTime() + sessionDurationMs).toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    return { token, user: toCurrentUser(user) };
  },

  authenticate(token: string | undefined) {
    if (!token) return null;
    const now = new Date();
    const row = db.prepare(`
      SELECT u.*, s.id AS sessionId, s.expiresAt, s.lastUsedAt
      FROM Session s
      INNER JOIN User u ON u.id = s.userId
      WHERE s.tokenHash = ?
    `).get(hashToken(token)) as
      | (UserRow & { sessionId: string; expiresAt: string; lastUsedAt: string })
      | undefined;

    if (!row || !row.isActive || new Date(row.expiresAt) <= now) {
      if (row) db.prepare("DELETE FROM Session WHERE id = ?").run(row.sessionId);
      return null;
    }

    if (now.getTime() - new Date(row.lastUsedAt).getTime() >= sessionRefreshIntervalMs) {
      db.prepare("UPDATE Session SET expiresAt = ?, lastUsedAt = ? WHERE id = ?").run(
        new Date(now.getTime() + sessionDurationMs).toISOString(),
        now.toISOString(),
        row.sessionId,
      );
    }
    return toCurrentUser(row);
  },

  logout(token: string | undefined) {
    if (token) db.prepare("DELETE FROM Session WHERE tokenHash = ?").run(hashToken(token));
  },

  changePassword(userId: string, input: unknown) {
    const data = changePasswordSchema.parse(input);
    const user = getUserById(userId);
    if (!user || !user.isActive) throw new AppError("AUTH_REQUIRED", "请先登录", 401);
    if (!verifyPassword(data.currentPassword, user.passwordHash)) {
      throw new AppError("CURRENT_PASSWORD_INVALID", "当前密码不正确", 400);
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        UPDATE User
        SET passwordHash = ?, mustChangePassword = 0, updatedAt = ?
        WHERE id = ?
      `).run(hashPassword(data.newPassword), now, userId);
      db.prepare("DELETE FROM Session WHERE userId = ?").run(userId);
    })();
  },

  listUsers(actor: CurrentUserDto) {
    assertAdmin(actor);
    return (
      db.prepare("SELECT * FROM User ORDER BY createdAt ASC").all() as UserRow[]
    ).map(toAdminUser);
  },

  createUser(actor: CurrentUserDto, input: unknown) {
    assertAdmin(actor);
    const data = createUserSchema.parse(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO User (
          id, username, passwordHash, role, isActive, mustChangePassword, createdAt, updatedAt
        ) VALUES (?, ?, ?, 'USER', 1, 1, ?, ?)
      `).run(id, data.username, hashPassword(data.password), now, now);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new AppError("USERNAME_EXISTS", "用户名已存在", 409);
      }
      throw error;
    }
    return toAdminUser(getUserById(id) as UserRow);
  },

  updateUser(actor: CurrentUserDto, targetId: string, input: unknown) {
    assertAdmin(actor);
    const data = updateUserSchema.parse(input);
    const target = getUserById(targetId);
    if (!target) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
    if (data.isActive === false && target.id === actor.id) {
      throw new AppError("CANNOT_DISABLE_SELF", "不能停用当前管理员账号", 409);
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      if (data.password !== undefined) {
        db.prepare(`
          UPDATE User
          SET passwordHash = ?, mustChangePassword = 1, updatedAt = ?
          WHERE id = ?
        `).run(hashPassword(data.password), now, targetId);
      }
      if (data.isActive !== undefined) {
        db.prepare("UPDATE User SET isActive = ?, updatedAt = ? WHERE id = ?").run(
          data.isActive ? 1 : 0,
          now,
          targetId,
        );
      }
      if (data.password !== undefined || data.isActive === false) {
        db.prepare("DELETE FROM Session WHERE userId = ?").run(targetId);
      }
    })();
    return toAdminUser(getUserById(targetId) as UserRow);
  },
};

export const authConstants = {
  sessionDurationSeconds: sessionDurationMs / 1000,
};
