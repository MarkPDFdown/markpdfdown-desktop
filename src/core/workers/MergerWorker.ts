import fs from 'fs/promises';
import path from 'path';
import { WorkerBase } from './WorkerBase.js';
import { prisma } from '../db/index.js';
import { Task, TaskStatus } from '../../shared/types/index.js';
import { PageStatus } from '../../shared/types/PageStatus.js';
import { WORKER_CONFIG } from '../config/worker.config.js';

/**
 * 已完成页面的精简类型（仅包含合并所需字段）
 */
type CompletedPage = {
  page: number;
  content: string;
};

/**
 * MergerWorker - 合并 Markdown 页面为最终文档
 *
 * 职责：
 * 1. 监听 READY_TO_MERGE 状态的任务
 * 2. 按页码顺序合并所有已完成页面的 Markdown 内容
 * 3. 将合并后的文档写入文件系统
 * 4. 更新任务状态为 COMPLETED
 *
 * 设计特点：
 * - 单实例运行，避免并发合并冲突
 * - 合并完成后不清理临时文件，保留预览能力
 * - 输出文件与原始文件同名，扩展名改为 .md
 * - 支持优雅停止，停止时释放当前任务
 */
export class MergerWorker extends WorkerBase {
  /** 上传文件根目录 */
  private readonly uploadsDir: string;

  /** 当前正在处理的任务 ID，用于优雅停止时释放 */
  private currentTaskId: string | null = null;

  /**
   * 构造函数
   * @param uploadsDir - 上传文件根目录，合并后的文件将保存在此目录下的任务子目录中
   */
  constructor(uploadsDir: string) {
    super();
    this.uploadsDir = uploadsDir;
  }

  /**
   * Worker 主循环
   *
   * 持续轮询 READY_TO_MERGE 状态的任务，抢占后进行合并处理。
   * 通过 isRunning 标志支持优雅停止。
   */
  async run(): Promise<void> {
    this.isRunning = true;
    console.log(`[Merger-${this.workerId.slice(0, 8)}] Started`);

    while (this.isRunning) {
      try {
        // 尝试抢占一个待合并的任务
        const task = await this.claimTask(
          TaskStatus.READY_TO_MERGE,
          TaskStatus.MERGING
        );

        if (!task) {
          // 无可用任务，等待后重试
          await this.sleep(WORKER_CONFIG.merger.pollInterval);
          continue;
        }

        // 记录当前任务 ID，用于优雅停止
        this.currentTaskId = task.id!;
        console.log(`[Merger-${this.workerId.slice(0, 8)}] Claimed task ${task.id}`);

        try {
          // 执行合并流程
          await this.mergeTask(task);
        } catch (error) {
          // 合并失败，记录错误并更新状态
          console.error(`[Merger-${this.workerId.slice(0, 8)}] Failed to merge task ${task.id}:`, error);
          await this.handleError(task.id!, error);
        } finally {
          // 清除当前任务 ID
          this.currentTaskId = null;
        }
      } catch (error) {
        // 主循环级别的错误，记录但继续运行
        console.error(`[Merger-${this.workerId.slice(0, 8)}] Unexpected error in main loop:`, error);
        // 尝试释放当前任务
        if (this.currentTaskId !== null) {
          await this.releaseCurrentTask();
        }
        await this.sleep(WORKER_CONFIG.merger.pollInterval);
      }
    }

    console.log(`[Merger-${this.workerId.slice(0, 8)}] Stopped`);
  }

  /**
   * 优雅停止 Worker
   *
   * 覆盖基类方法，添加释放当前任务的逻辑。
   * 如果正在处理任务，将其释放回 READY_TO_MERGE 状态。
   */
  override stop(): void {
    this.isRunning = false;
    console.log(`[Merger-${this.workerId.slice(0, 8)}] Stopping...`);

    // 异步释放当前任务
    if (this.currentTaskId !== null) {
      this.releaseCurrentTask().catch((error) => {
        console.error(`[Merger-${this.workerId.slice(0, 8)}] Failed to release task on stop:`, error);
      });
    }
  }

  /**
   * 释放当前任务回 READY_TO_MERGE 状态
   *
   * 用于优雅停止或异常恢复时释放任务。
   */
  private async releaseCurrentTask(): Promise<void> {
    if (this.currentTaskId === null) return;

    try {
      await prisma.task.update({
        where: { id: this.currentTaskId },
        data: {
          status: TaskStatus.READY_TO_MERGE,
          worker_id: null,
        },
      });
      console.log(`[Merger-${this.workerId.slice(0, 8)}] Released task ${this.currentTaskId}`);
      this.currentTaskId = null;
    } catch (error) {
      console.error(`[Merger-${this.workerId.slice(0, 8)}] Failed to release task ${this.currentTaskId}:`, error);
    }
  }

  /**
   * 执行任务合并
   *
   * @param task - 待合并的任务
   */
  private async mergeTask(task: Task): Promise<void> {
    // 1. 获取所有已完成的页面
    const pages = await this.getCompletedPages(task.id!);

    if (pages.length === 0) {
      throw new Error('No completed pages found for merging');
    }

    console.log(`[Merger-${this.workerId.slice(0, 8)}] Merging ${pages.length} pages for task ${task.id}`);

    // 2. 合并 Markdown 内容
    const mergedContent = this.mergeMarkdown(pages);

    // 3. 保存合并后的文件
    const outputPath = await this.saveMergedFile(task, mergedContent);

    // 4. 更新任务状态为完成
    await this.updateTaskStatus(task.id!, TaskStatus.COMPLETED, {
      progress: 100,
      worker_id: null, // 释放 worker 占用
      merged_path: outputPath, // 合并后的文件路径，前端需要此字段启用下载按钮
    });

    console.log(`[Merger-${this.workerId.slice(0, 8)}] Task ${task.id} merged successfully: ${outputPath}`);
  }

  /**
   * 获取任务的所有已完成页面
   *
   * @param taskId - 任务 ID
   * @returns 已完成的页面列表，按页码排序
   */
  private async getCompletedPages(taskId: string): Promise<CompletedPage[]> {
    return await prisma.taskDetail.findMany({
      where: {
        task: taskId,
        status: PageStatus.COMPLETED,
      },
      orderBy: {
        page: 'asc',
      },
      select: {
        page: true,
        content: true,
      },
    });
  }

  /**
   * 合并 Markdown 内容
   *
   * 格式：
   * - 每页以 <!-- Page N --> 注释开头
   * - 页面之间使用 --- 分隔线分隔
   * - 使用 LF 换行符确保跨平台兼容性
   *
   * @param pages - 已完成的页面列表
   * @returns 合并后的 Markdown 内容
   */
  private mergeMarkdown(pages: CompletedPage[]): string {
    return pages
      .map((page) => {
        // 每页添加页码注释，方便定位
        return `<!-- Page ${page.page} -->\n\n${page.content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * 计算输出文件路径
   *
   * 使用 path.parse() 可靠地处理各种文件名边界情况：
   * - 以点开头的隐藏文件（如 .hidden）
   * - 多个点的文件名（如 my.report.2024.pdf）
   * - 无扩展名的文件（如 document）
   *
   * 路径格式: {uploadsDir}/{taskId}/{filename}.md
   * 例如: files/abc123/document.md (原文件为 document.pdf)
   *
   * @param task - 任务对象
   * @returns 输出文件的完整路径
   */
  private getOutputPath(task: Task): string {
    // 使用 path.parse() 可靠地提取文件名（不含扩展名）
    const { name } = path.parse(task.filename!);
    const outputFileName = `${name}.md`;

    // 输出到任务目录下，与 split 目录同级
    return path.join(this.uploadsDir, task.id!, outputFileName);
  }

  /**
   * 保存合并后的文件
   *
   * @param task - 任务对象
   * @param content - 合并后的 Markdown 内容
   * @returns 保存的文件路径
   */
  private async saveMergedFile(task: Task, content: string): Promise<string> {
    const outputPath = this.getOutputPath(task);

    // 确保目录存在
    const outputDir = path.dirname(outputPath);
    await this.ensureDirectoryExists(outputDir);

    // 写入文件（UTF-8 编码，LF 换行符）
    await fs.writeFile(outputPath, content, { encoding: 'utf-8' });

    return outputPath;
  }

  /**
   * 确保目录存在，不存在则创建
   *
   * @param dirPath - 目录路径
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}
