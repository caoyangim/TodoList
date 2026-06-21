#!/usr/bin/env node

/**
 * 孤立文件清理脚本
 *
 * 使用方法：
 *   npm run cleanup-orphaned-files              # 只显示报告
 *   npm run cleanup-orphaned-files -- --delete  # 删除孤立文件
 *   npm run cleanup-orphaned-files -- --archive # 移动到 .archive 目录
 */

import fs from "node:fs";
import path from "node:path";
import { db } from "@/server/db";
import { fileReferenceService } from "@/server/services/file-reference-service";

const fileDirectory = path.resolve(
  process.env.NOTE_FILE_DIR ?? path.join(process.cwd(), "data", "note-files"),
);
const archiveDirectory = path.join(fileDirectory, ".archive");
const args = process.argv.slice(2);
const mode = args.includes("--delete")
  ? "delete"
  : args.includes("--archive")
    ? "archive"
    : "report";

interface OrphanedFile {
  fileId: string;
  userId: string;
  extension: string;
  path: string;
  sizeKb: number;
  createdAt: string;
}

function getStoredFilename(fileId: string, extension: string) {
  return extension ? `${fileId}.${extension}` : fileId;
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function scanOrphanedFiles(): OrphanedFile[] {
  const orphaned: OrphanedFile[] = [];

  if (!fs.existsSync(fileDirectory)) {
    console.log(`文件目录不存在: ${fileDirectory}`);
    return orphaned;
  }

  // 获取数据库中所有文件
  const allFiles = db
    .prepare("SELECT id, userId, extension, size, createdAt FROM NoteFile")
    .all() as {
      id: string;
      userId: string;
      extension: string;
      size: number;
      createdAt: string;
    }[];

  console.log(`\n📊 扫描孤立文件...\n`);
  console.log(`   数据库中文件总数: ${allFiles.length}`);

  for (const file of allFiles) {
    // 检查文件是否被引用
    if (!fileReferenceService.isFileReferenced(file.userId, file.id)) {
      const filename = getStoredFilename(file.id, file.extension);
      const filePath = path.join(fileDirectory, filename);
      let actualSize = file.size;

      // 检查文件是否存在于文件系统
      if (fs.existsSync(filePath)) {
        actualSize = fs.statSync(filePath).size;
      }

      orphaned.push({
        fileId: file.id,
        userId: file.userId,
        extension: file.extension,
        path: filePath,
        sizeKb: Math.ceil(actualSize / 1024),
        createdAt: file.createdAt,
      });
    }
  }

  return orphaned;
}

function generateReport(orphaned: OrphanedFile[]): void {
  if (orphaned.length === 0) {
    console.log("✅ 没有找到孤立文件");
    return;
  }

  console.log(`\n⚠️  找到 ${orphaned.length} 个孤立文件:\n`);

  // 按用户分组
  const byUser = new Map<string, OrphanedFile[]>();
  for (const file of orphaned) {
    if (!byUser.has(file.userId)) {
      byUser.set(file.userId, []);
    }
    byUser.get(file.userId)!.push(file);
  }

  let totalSize = 0;
  for (const [userId, files] of byUser) {
    const userTotalSize = files.reduce((sum, f) => sum + f.sizeKb * 1024, 0);
    totalSize += userTotalSize;

    console.log(`👤 用户 ${userId.substring(0, 8)}...`);
    console.log(`   文件数: ${files.length}`);
    console.log(`   总大小: ${formatSize(userTotalSize)}`);
    console.log();
  }

  console.log(`📈 统计`);
  console.log(`   总孤立文件数: ${orphaned.length}`);
  console.log(`   总占用空间: ${formatSize(totalSize)}`);
  console.log();

  if (mode === "report") {
    console.log(
      `💡 提示: 运行 \`npm run cleanup-orphaned-files -- --delete\` 删除这些文件`,
    );
    console.log(
      `   或运行 \`npm run cleanup-orphaned-files -- --archive\` 将其移到 .archive 目录`,
    );
  }
}

function deleteOrphanedFiles(orphaned: OrphanedFile[]): void {
  console.log(`\n🗑️  删除 ${orphaned.length} 个孤立文件...\n`);

  let deletedCount = 0;
  let failedCount = 0;

  for (const file of orphaned) {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        console.log(
          `   ✓ 已删除: ${file.fileId} (${formatSize(file.sizeKb * 1024)})`,
        );
        deletedCount++;
      } else {
        console.log(`   ⚠ 文件已不存在: ${file.fileId}`);
      }

      // 从数据库删除记录
      db.prepare("DELETE FROM NoteFile WHERE id = ? AND userId = ?").run(
        file.fileId,
        file.userId,
      );
    } catch (error) {
      console.log(
        `   ✗ 删除失败: ${file.fileId} - ${error instanceof Error ? error.message : "未知错误"}`,
      );
      failedCount++;
    }
  }

  console.log(`\n✅ 删除完成`);
  console.log(`   成功: ${deletedCount}`);
  console.log(`   失败: ${failedCount}`);
}

function archiveOrphanedFiles(orphaned: OrphanedFile[]): void {
  console.log(
    `\n📦 归档 ${orphaned.length} 个孤立文件到 ${archiveDirectory}...\n`,
  );

  // 创建归档目录
  fs.mkdirSync(archiveDirectory, { recursive: true });

  let archivedCount = 0;
  let failedCount = 0;

  for (const file of orphaned) {
    try {
      const archivePath = path.join(
        archiveDirectory,
        getStoredFilename(file.fileId, file.extension),
      );

      if (fs.existsSync(file.path)) {
        fs.renameSync(file.path, archivePath);
        console.log(
          `   ✓ 已归档: ${file.fileId} (${formatSize(file.sizeKb * 1024)})`,
        );
        archivedCount++;
      } else {
        console.log(`   ⚠ 文件已不存在: ${file.fileId}`);
      }

      // 从数据库删除记录
      db.prepare("DELETE FROM NoteFile WHERE id = ? AND userId = ?").run(
        file.fileId,
        file.userId,
      );
    } catch (error) {
      console.log(
        `   ✗ 归档失败: ${file.fileId} - ${error instanceof Error ? error.message : "未知错误"}`,
      );
      failedCount++;
    }
  }

  console.log(`\n✅ 归档完成`);
  console.log(`   成功: ${archivedCount}`);
  console.log(`   失败: ${failedCount}`);
  console.log(`   归档位置: ${archiveDirectory}`);
}

function main() {
  try {
    const orphaned = scanOrphanedFiles();

    if (mode === "report") {
      generateReport(orphaned);
    } else if (mode === "delete") {
      if (orphaned.length === 0) {
        console.log("✅ 没有孤立文件需要删除");
        return;
      }

      // 确认删除
      console.log(`\n⚠️  即将删除 ${orphaned.length} 个孤立文件`);
      console.log("   此操作不可撤销，请确保已备份重要数据\n");

      // 对于自动脚本，直接删除；对于交互模式可以添加确认
      deleteOrphanedFiles(orphaned);
    } else if (mode === "archive") {
      if (orphaned.length === 0) {
        console.log("✅ 没有孤立文件需要归档");
        return;
      }

      archiveOrphanedFiles(orphaned);
    }
  } catch (error) {
    console.error(
      "❌ 错误:",
      error instanceof Error ? error.message : "未知错误",
    );
    process.exit(1);
  }
}

main();
