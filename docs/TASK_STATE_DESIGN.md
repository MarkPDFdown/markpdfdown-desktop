# 任务状态机设计方案

> **版本**: v2.0
> **创建日期**: 2026-01-20
> **更新日期**: 2026-01-20
> **设计目标**: 基于状态机的多 Worker 任务调度系统

---

## 目录

- [1. 架构概览](#1-架构概览)
- [2. 状态机设计](#2-状态机设计)
- [3. 数据库 Schema](#3-数据库-schema)
- [4. Worker 设计](#4-worker-设计)
- [5. 核心机制](#5-核心机制)
- [6. 特殊场景处理](#6-特殊场景处理)
- [7. 资源清理策略](#7-资源清理策略)
- [8. 实施路线图](#8-实施路线图)

---

## 1. 架构概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Task Queue System                        │
├─────────────────────────────────────────────────────────────┤
│  Database (SQLite + Prisma)                                  │
│  ┌──────────────┐         ┌──────────────────┐             │
│  │    Task      │ 1───N   │   TaskDetail     │             │
│  │  (主任务)     │────────▶│   (单页详情)      │             │
│  └──────────────┘         └──────────────────┘             │
└─────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐          ┌───┴────┐          ┌────┴────┐
    │ Splitter│          │Converter          │ Merger  │
    │ Worker  │          │ Worker Pool       │ Worker  │
    │  (x1)   │          │  (x N)            │  (x1)   │
    └─────────┘          └─────────┘         └─────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   HealthChecker   │
                    │   (超时恢复)       │
                    └───────────────────┘
```

### 1.2 设计原则

1. **状态驱动**: 所有 Worker 基于数据库状态抢占任务，无需中心调度器
2. **原子操作**: 使用数据库事务保证状态转换的原子性
3. **职责分离**: 每个 Worker 只负责一个特定阶段的处理
4. **水平扩展**: Converter Worker 可以扩展到多个实例
5. **容错恢复**: 支持超时检测、自动重试、异常恢复
6. **幂等性**: Worker 操作具备幂等性，防止重复处理
7. **即时检测**: ConverterWorker 完成页面时直接检测任务完成状态，无需轮询

---

## 2. 状态机设计

### 2.1 Task 状态机

#### 状态定义

```typescript
enum TaskStatus {
  // 初始阶段
  PENDING = 1,           // 等待拆分
  SPLITTING = 2,         // 拆分中（被 Splitter 占用）

  // 处理阶段
  PROCESSING = 3,        // 转换中（拆分完成，页面正在转换）

  // 合并阶段
  READY_TO_MERGE = 4,    // 准备合并（所有页转换完成，等待 Merger）
  MERGING = 5,           // 合并中（被 Merger 占用）

  // 终态
  COMPLETED = 6,         // 成功完成
  FAILED = 0,            // 失败
  CANCELLED = 7,         // 已取消

  // 特殊状态
  PARTIAL_FAILED = 8,    // 部分页面失败
}
```

#### 状态转换图

```
                    ┌─────────────────────────────────────┐
                    │         用户上传 PDF                 │
                    └──────────────┬──────────────────────┘
                                   ▼
                            ┌─────────────┐
                            │  1.PENDING  │ ◀─┐
                            └──────┬──────┘   │
                                   │          │ 重试失败任务
                    SplitterWorker │          │
                    抢占并拆分 PDF  │          │
                                   ▼          │
                            ┌──────────────┐  │
                            │ 2.SPLITTING  │  │
                            └──────┬───────┘  │
                                   │          │
                        拆分完成，创建所有     │
                        TaskDetail 记录      │
                                   ▼          │
                        ┌──────────────────┐ │
                        │  3.PROCESSING    │ │
                        └──────┬───────────┘ │
                               │             │
                ConverterWorker│             │
                完成最后一页时  │             │
                直接检测并转换  │             │
                               ▼             │
                        ┌──────────────────┐│
                    ┌──▶│ 4.READY_TO_MERGE ││
                    │   └──────┬───────────┘│
                    │          │            │
        单页重试触发 │ MergerWorker          │
        重新合并    │ 抢占并合并            │
                    │          ▼            │
                    │   ┌─────────────┐    │
                    │   │ 5.MERGING   │    │
                    │   └──────┬──────┘    │
                    │          │           │
                    │    合并成功          │
                    │          ▼           │
                    │   ┌─────────────┐   │
                    └───│ 6.COMPLETED │   │
                        └─────────────┘   │
                                          │
        ┌─────────────────────────────────┘
        │
        │  任何阶段发生错误
        ▼
  ┌─────────────┐      ┌─────────────────┐
  │  0.FAILED   │◀────▶│8.PARTIAL_FAILED │
  └─────────────┘      └─────────────────┘
        │                      │
        └──────────┬───────────┘
                   │ 用户重试
                   ▼
            ┌─────────────┐
            │  1.PENDING  │
            └─────────────┘

  任何状态 ──用户取消──▶ ┌─────────────┐
                        │ 7.CANCELLED │
                        └─────────────┘
```

#### 状态转换规则

| 当前状态 | 触发条件 | 目标状态 | 执行者 |
|---------|---------|---------|--------|
| PENDING | SplitterWorker 抢占 | SPLITTING | SplitterWorker |
| SPLITTING | 拆分完成 | PROCESSING | SplitterWorker |
| SPLITTING | 拆分失败 | FAILED | SplitterWorker |
| PROCESSING | 所有页面成功完成 | READY_TO_MERGE | ConverterWorker |
| PROCESSING | 所有页面处理完但有失败 | PARTIAL_FAILED | ConverterWorker |
| READY_TO_MERGE | MergerWorker 抢占 | MERGING | MergerWorker |
| MERGING | 合并完成 | COMPLETED | MergerWorker |
| MERGING | 合并失败 | FAILED | MergerWorker |
| COMPLETED | 用户重试单页 | PROCESSING | API Handler |
| PARTIAL_FAILED | 用户重试失败页 | PROCESSING | API Handler |
| FAILED | 用户点击重试 | PENDING | API Handler |
| 任何状态 | 用户取消 | CANCELLED | API Handler |

### 2.2 TaskDetail 状态机

#### 状态定义

```typescript
enum PageStatus {
  PENDING = 0,           // 等待转换
  PROCESSING = 1,        // 转换中（被 Converter 占用）
  COMPLETED = 2,         // 成功
  FAILED = -1,           // 失败
  RETRYING = 3,          // 重试中（用户触发）
}
```

#### 状态转换图

```
  ┌─────────────┐
  │  0.PENDING  │ ◀────────┐
  └──────┬──────┘          │
         │                 │ 超时回退
         │ ConverterWorker │
         │ 抢占            │
         ▼                 │
  ┌──────────────┐         │
  │ 1.PROCESSING │─────────┘
  └───┬──────┬───┘
      │      │
  成功 │      │ 失败
      ▼      ▼
  ┌─────┐  ┌────────┐
  │ 2.  │  │ -1.    │
  │COMP │  │FAILED  │
  │LETED│  └───┬────┘
  └─────┘      │
      ▲        │ 用户重试
      │        ▼
      │   ┌──────────┐
      │   │ 3.       │
      └───┤RETRYING  │
          └──────────┘
```

---

## 3. 数据库 Schema

### 3.1 Task 表

```prisma
model Task {
  id              String   @unique
  filename        String
  type            String
  page_range      String
  pages           Int                    // 总页数
  provider        Int
  model           String
  model_name      String

  // 进度和状态
  progress        Int      @default(0)   // 0-100
  status          Int      @default(1)   // TaskStatus
  completed_count Int      @default(0)   // 已完成页面数
  failed_count    Int      @default(0)   // 失败页面数

  // Worker 追踪
  worker_id       String?               // 当前处理的 worker ID

  // 结果和错误
  merged_path     String?               // 合并后的文件路径
  error           String?               // 错误信息

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([status])
  @@index([status, updatedAt])
}
```

### 3.2 TaskDetail 表

```prisma
model TaskDetail {
  id          Int      @id @default(autoincrement())
  task        String                    // 关联 Task.id
  page        Int                       // 当前页码 (1-based)
  page_source Int                       // 原始 PDF 页码

  // 状态和处理
  status      Int      @default(0)      // PageStatus
  worker_id   String?                   // 当前处理的 worker ID

  // LLM 配置
  provider    Int
  model       String

  // 结果和错误
  content     String   @default("")     // 转换后的 Markdown
  image_path  String?                   // 页面图片路径
  error       String?                   // 错误信息
  retry_count Int      @default(0)      // 重试次数

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([task, status])
  @@index([task, page])
}
```

### 3.3 Migration 脚本

需要创建的迁移：

```bash
# 添加新字段到 Task 表
npx prisma migrate dev --name add_task_worker_fields

# 添加新字段到 TaskDetail 表
npx prisma migrate dev --name add_taskdetail_worker_fields
```

---

## 4. Worker 设计

### 4.1 WorkerBase 基类

所有 Worker 的抽象基类：

```typescript
import { randomUUID } from 'crypto';

abstract class WorkerBase {
  protected workerId: string;
  protected isRunning: boolean = false;

  constructor(workerId?: string) {
    // 使用 UUID 确保唯一性
    this.workerId = workerId || `${this.constructor.name}-${randomUUID()}`;
  }

  /**
   * 抢占任务（原子操作）
   */
  protected async claimTask(
    fromStatus: TaskStatus,
    toStatus: TaskStatus
  ): Promise<Task | null> {
    return await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: {
          status: fromStatus,
          OR: [
            { worker_id: null },
            { updatedAt: { lt: new Date(Date.now() - TASK_TIMEOUT) } }
          ]
        },
        orderBy: { createdAt: 'asc' }
      });

      if (!task) return null;

      return await tx.task.update({
        where: { id: task.id },
        data: {
          status: toStatus,
          worker_id: this.workerId,
          updatedAt: new Date()
        }
      });
    });
  }

  /**
   * 更新任务状态
   */
  protected async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    extra?: Partial<Task>
  ): Promise<Task> {
    return await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        worker_id: null, // 释放占用
        ...extra,
        updatedAt: new Date()
      }
    });
  }

  /**
   * 处理错误
   */
  protected async handleError(taskId: string, error: Error): Promise<void> {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.FAILED,
        error: error.message,
        worker_id: null
      }
    });
  }

  /**
   * 睡眠
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Worker 主循环（由子类实现）
   */
  abstract run(): Promise<void>;

  /**
   * 停止 Worker
   */
  async stop(): Promise<void> {
    this.isRunning = false;
  }
}
```

### 4.2 SplitterWorker

负责拆分 PDF 为单页图片。

```typescript
class SplitterWorker extends WorkerBase {
  async run(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      const task = await this.claimTask(
        TaskStatus.PENDING,
        TaskStatus.SPLITTING
      );

      if (!task) {
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      try {
        // 1. 拆分 PDF
        const pages = await this.splitPDF(task);

        // 2. 创建 TaskDetail 记录并更新状态（原子操作）
        await prisma.$transaction(async (tx) => {
          // 批量创建 TaskDetail
          const details = pages.map(page => ({
            task: task.id,
            page: page.page,
            page_source: page.page,
            status: PageStatus.PENDING,
            provider: task.provider,
            model: task.model,
            image_path: page.imagePath,
            content: ''
          }));
          await tx.taskDetail.createMany({ data: details });

          // 更新任务状态为 PROCESSING
          await tx.task.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.PROCESSING,
              pages: pages.length,
              worker_id: null,
              updatedAt: new Date()
            }
          });
        });

        console.log(`[Splitter] Task ${task.id} split into ${pages.length} pages`);

      } catch (error) {
        console.error(`[Splitter] Error splitting task ${task.id}:`, error);
        await this.handleError(task.id, error as Error);
      }
    }
  }

  /**
   * 拆分 PDF 为单页图片
   */
  private async splitPDF(task: Task): Promise<PageInfo[]> {
    // TODO: 实现 PDF 拆分逻辑
    // 1. 读取 PDF 文件
    // 2. 按页拆分为图片
    // 3. 保存图片到临时目录
    // 4. 返回页面信息数组

    const pdfPath = path.join(UPLOAD_DIR, task.filename);
    const outputDir = path.join(TEMP_DIR, task.id);

    // 使用 pdf-lib 或其他库拆分
    // 返回格式：
    return [
      { page: 1, imagePath: `${outputDir}/page-1.png` },
      { page: 2, imagePath: `${outputDir}/page-2.png` },
      // ...
    ];
  }
}
```

### 4.3 ConverterWorker

负责将单页图片转换为 Markdown，并在完成时检测任务状态。

```typescript
class ConverterWorker extends WorkerBase {
  async run(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      const page = await this.claimPage();

      if (!page) {
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      try {
        // 1. 调用 LLM 转换
        const markdown = await this.convertToMarkdown(page);

        // 2. 更新页面状态和内容（带幂等性检查和任务完成检测）
        await this.completePageSuccess(page, markdown);

        console.log(`[Converter-${this.workerId}] Completed page ${page.page} of task ${page.task}`);

      } catch (error) {
        console.error(`[Converter-${this.workerId}] Error converting page ${page.id}:`, error);
        await this.completePageFailed(page, error as Error);
      }
    }
  }

  /**
   * 抢占待处理的页面
   */
  private async claimPage(): Promise<TaskDetail | null> {
    return await prisma.$transaction(async (tx) => {
      // 1. 找到有待处理页面的任务
      const task = await tx.task.findFirst({
        where: {
          status: TaskStatus.PROCESSING
        },
        orderBy: { createdAt: 'asc' }
      });

      if (!task) return null;

      // 2. 抢占该任务的一个待处理页面
      const page = await tx.taskDetail.findFirst({
        where: {
          task: task.id,
          status: { in: [PageStatus.PENDING, PageStatus.RETRYING] }
        },
        orderBy: { page: 'asc' }
      });

      if (!page) return null;

      // 3. 更新页面状态
      const updatedPage = await tx.taskDetail.update({
        where: { id: page.id },
        data: {
          status: PageStatus.PROCESSING,
          worker_id: this.workerId,
          updatedAt: new Date()
        }
      });

      return updatedPage;
    });
  }

  /**
   * 调用 LLM 转换页面为 Markdown
   */
  private async convertToMarkdown(page: TaskDetail): Promise<string> {
    // TODO: 实现 LLM 调用逻辑
    // 1. 读取页面图片
    // 2. 调用对应的 LLM Client
    // 3. 返回 Markdown 文本

    const imageBase64 = await this.readImageAsBase64(page.image_path!);

    // 根据 provider 选择 LLM Client
    const client = this.getLLMClient(page.provider, page.model);
    const markdown = await client.imageToMarkdown(imageBase64);

    return markdown;
  }

  /**
   * 完成页面（成功）- 带幂等性检查和任务完成检测
   */
  private async completePageSuccess(
    page: TaskDetail,
    markdown: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. 幂等性检查：确认当前 Worker 仍持有该页面
      const currentPage = await tx.taskDetail.findUnique({
        where: { id: page.id }
      });

      if (!currentPage ||
          currentPage.worker_id !== this.workerId ||
          currentPage.status !== PageStatus.PROCESSING) {
        console.log(`[Converter-${this.workerId}] Page ${page.id} already processed, skipping`);
        return;
      }

      // 2. 检查任务是否已取消
      const task = await tx.task.findUnique({
        where: { id: page.task }
      });

      if (!task || task.status === TaskStatus.CANCELLED) {
        console.log(`[Converter-${this.workerId}] Task ${page.task} was cancelled, discarding result`);
        return;
      }

      // 3. 更新页面状态
      await tx.taskDetail.update({
        where: { id: page.id },
        data: {
          status: PageStatus.COMPLETED,
          content: markdown,
          worker_id: null,
          updatedAt: new Date()
        }
      });

      // 4. 原子增加完成计数器并获取更新后的任务状态
      const updatedTask = await tx.task.update({
        where: { id: page.task },
        data: {
          completed_count: { increment: 1 },
          updatedAt: new Date()
        }
      });

      // 5. 检测任务是否完成（关键：在事务中检测，利用行锁避免竞态）
      const finishedCount = updatedTask.completed_count + updatedTask.failed_count;
      const progress = Math.floor((updatedTask.completed_count / updatedTask.pages) * 100);

      if (finishedCount === updatedTask.pages) {
        // 所有页面处理完毕
        if (updatedTask.completed_count === updatedTask.pages) {
          // 全部成功 → READY_TO_MERGE
          await tx.task.update({
            where: { id: page.task },
            data: {
              status: TaskStatus.READY_TO_MERGE,
              progress
            }
          });
          console.log(`[Converter-${this.workerId}] Task ${page.task}: PROCESSING → READY_TO_MERGE`);
        } else {
          // 有失败 → PARTIAL_FAILED
          await tx.task.update({
            where: { id: page.task },
            data: {
              status: TaskStatus.PARTIAL_FAILED,
              progress
            }
          });
          console.log(`[Converter-${this.workerId}] Task ${page.task}: PROCESSING → PARTIAL_FAILED`);
        }
      } else {
        // 更新进度
        await tx.task.update({
          where: { id: page.task },
          data: { progress }
        });
      }
    });
  }

  /**
   * 完成页面（失败）- 带幂等性检查和任务完成检测
   */
  private async completePageFailed(
    page: TaskDetail,
    error: Error
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. 幂等性检查
      const currentPage = await tx.taskDetail.findUnique({
        where: { id: page.id }
      });

      if (!currentPage ||
          currentPage.worker_id !== this.workerId ||
          currentPage.status !== PageStatus.PROCESSING) {
        console.log(`[Converter-${this.workerId}] Page ${page.id} already processed, skipping`);
        return;
      }

      // 2. 检查任务是否已取消
      const task = await tx.task.findUnique({
        where: { id: page.task }
      });

      if (!task || task.status === TaskStatus.CANCELLED) {
        console.log(`[Converter-${this.workerId}] Task ${page.task} was cancelled, discarding result`);
        return;
      }

      // 3. 更新页面状态
      await tx.taskDetail.update({
        where: { id: page.id },
        data: {
          status: PageStatus.FAILED,
          error: error.message,
          retry_count: { increment: 1 },
          worker_id: null,
          updatedAt: new Date()
        }
      });

      // 4. 原子增加失败计数器
      const updatedTask = await tx.task.update({
        where: { id: page.task },
        data: {
          failed_count: { increment: 1 },
          updatedAt: new Date()
        }
      });

      // 5. 检测任务是否完成
      const finishedCount = updatedTask.completed_count + updatedTask.failed_count;
      const progress = Math.floor((updatedTask.completed_count / updatedTask.pages) * 100);

      if (finishedCount === updatedTask.pages) {
        // 所有页面处理完毕（肯定有失败）→ PARTIAL_FAILED
        await tx.task.update({
          where: { id: page.task },
          data: {
            status: TaskStatus.PARTIAL_FAILED,
            progress
          }
        });
        console.log(`[Converter-${this.workerId}] Task ${page.task}: PROCESSING → PARTIAL_FAILED`);
      } else {
        // 更新进度
        await tx.task.update({
          where: { id: page.task },
          data: { progress }
        });
      }
    });
  }
}
```

### 4.4 MergerWorker

负责合并所有完成的页面为一个 Markdown 文件。

```typescript
class MergerWorker extends WorkerBase {
  async run(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      const task = await this.claimTask(
        TaskStatus.READY_TO_MERGE,
        TaskStatus.MERGING
      );

      if (!task) {
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      try {
        // 1. 获取所有已完成的页面
        const pages = await this.getCompletedPages(task.id);

        // 2. 合并 Markdown
        const mergedContent = this.mergeMarkdown(pages);

        // 3. 保存合并结果
        const filePath = await this.saveMergedFile(task, mergedContent);

        // 4. 更新状态
        await this.updateTaskStatus(task.id, TaskStatus.COMPLETED, {
          progress: 100,
          merged_path: filePath
        });

        // 5. 清理临时文件
        await this.cleanupTempFiles(task.id);

        console.log(`[Merger] Task ${task.id} merged successfully`);

      } catch (error) {
        console.error(`[Merger] Error merging task ${task.id}:`, error);
        await this.handleError(task.id, error as Error);
      }
    }
  }

  /**
   * 获取所有已完成的页面
   */
  private async getCompletedPages(taskId: string): Promise<TaskDetail[]> {
    return await prisma.taskDetail.findMany({
      where: {
        task: taskId,
        status: PageStatus.COMPLETED
      },
      orderBy: { page: 'asc' }
    });
  }

  /**
   * 合并 Markdown 内容
   */
  private mergeMarkdown(pages: TaskDetail[]): string {
    return pages
      .map(page => {
        return `<!-- Page ${page.page} -->\n\n${page.content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * 保存合并后的文件
   */
  private async saveMergedFile(
    task: Task,
    content: string
  ): Promise<string> {
    const outputDir = path.join(OUTPUT_DIR, task.id);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const filename = task.filename.replace(/\.[^.]+$/, '.md');
    const filePath = path.join(outputDir, filename);

    await fs.promises.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * 清理临时文件（拆分后的图片）
   */
  private async cleanupTempFiles(taskId: string): Promise<void> {
    const tempDir = path.join(TEMP_DIR, taskId);
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log(`[Merger] Cleaned up temp files for task ${taskId}`);
    } catch (error) {
      console.warn(`[Merger] Failed to cleanup temp files for task ${taskId}:`, error);
    }
  }
}
```

### 4.5 HealthChecker

负责超时检测和任务恢复。

```typescript
class HealthChecker {
  private interval: NodeJS.Timeout | null = null;

  /**
   * 启动健康检查
   */
  start(): void {
    this.interval = setInterval(
      () => this.checkStuckTasks(),
      HEALTH_CHECK_INTERVAL
    );
    console.log('[HealthChecker] Started');
  }

  /**
   * 停止健康检查
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('[HealthChecker] Stopped');
  }

  /**
   * 检查并恢复超时的任务
   */
  async checkStuckTasks(): Promise<void> {
    const stuckTime = new Date(Date.now() - TASK_TIMEOUT);

    // 1. 回退超时的 SPLITTING 任务 → PENDING
    const stuckSplitting = await prisma.task.updateMany({
      where: {
        status: TaskStatus.SPLITTING,
        updatedAt: { lt: stuckTime }
      },
      data: {
        status: TaskStatus.PENDING,
        worker_id: null
      }
    });

    if (stuckSplitting.count > 0) {
      console.log(`[HealthChecker] Reset ${stuckSplitting.count} stuck SPLITTING tasks`);
    }

    // 2. 回退超时的 MERGING 任务 → READY_TO_MERGE
    const stuckMerging = await prisma.task.updateMany({
      where: {
        status: TaskStatus.MERGING,
        updatedAt: { lt: stuckTime }
      },
      data: {
        status: TaskStatus.READY_TO_MERGE,
        worker_id: null
      }
    });

    if (stuckMerging.count > 0) {
      console.log(`[HealthChecker] Reset ${stuckMerging.count} stuck MERGING tasks`);
    }

    // 3. 回退超时的页面 → PENDING
    const stuckPages = await prisma.taskDetail.updateMany({
      where: {
        status: PageStatus.PROCESSING,
        updatedAt: { lt: stuckTime }
      },
      data: {
        status: PageStatus.PENDING,
        worker_id: null
      }
    });

    if (stuckPages.count > 0) {
      console.log(`[HealthChecker] Reset ${stuckPages.count} stuck pages`);
    }
  }
}
```

### 4.6 TaskOrchestrator

统一管理所有 Worker 的生命周期。

```typescript
class TaskOrchestrator {
  private splitter: SplitterWorker;
  private converters: ConverterWorker[];
  private merger: MergerWorker;
  private healthChecker: HealthChecker;

  constructor(config: {
    converterCount: number;
  }) {
    this.splitter = new SplitterWorker();
    this.converters = Array.from(
      { length: config.converterCount },
      (_, i) => new ConverterWorker(`converter-${i}`)
    );
    this.merger = new MergerWorker();
    this.healthChecker = new HealthChecker();
  }

  /**
   * 启动所有 Workers
   */
  async start(): Promise<void> {
    console.log('[Orchestrator] Starting all workers...');

    // 启动健康检查
    this.healthChecker.start();

    // 并行启动所有 workers（不阻塞）
    this.splitter.run().catch(e => console.error('[Splitter] Fatal error:', e));
    this.converters.forEach(c =>
      c.run().catch(e => console.error(`[Converter-${c['workerId']}] Fatal error:`, e))
    );
    this.merger.run().catch(e => console.error('[Merger] Fatal error:', e));

    console.log('[Orchestrator] All workers started');
  }

  /**
   * 停止所有 Workers
   */
  async stop(): Promise<void> {
    console.log('[Orchestrator] Stopping all workers...');

    // 停止健康检查
    this.healthChecker.stop();

    // 停止所有 workers
    await Promise.all([
      this.splitter.stop(),
      ...this.converters.map(c => c.stop()),
      this.merger.stop()
    ]);

    console.log('[Orchestrator] All workers stopped');
  }
}
```

---

## 5. 核心机制

### 5.1 状态抢占机制

使用数据库事务实现原子性的任务抢占：

```typescript
// 伪代码
BEGIN TRANSACTION
  1. SELECT task WHERE status = PENDING ORDER BY created_at LIMIT 1 FOR UPDATE
  2. IF task exists:
     UPDATE task SET status = SPLITTING, worker_id = 'worker-uuid'
     RETURN task
  3. ELSE:
     RETURN null
COMMIT
```

### 5.2 任务完成检测机制

ConverterWorker 在完成页面时直接检测任务是否完成，利用数据库行锁避免竞态：

```typescript
// 在事务中执行
// 1. increment completed_count（数据库行锁）
// 2. 返回更新后的整行数据
// 3. 检查 completed_count + failed_count === pages
// 4. 如果是，更新任务状态

// 由于 UPDATE 会锁定行，并发的 Worker 会排队执行
// 只有一个 Worker 会看到 finishedCount === pages
```

### 5.3 幂等性保证

Worker 完成页面时检查：

1. 当前 Worker 是否仍持有该页面（worker_id 匹配）
2. 页面是否仍为 PROCESSING 状态
3. 任务是否已被取消

```typescript
if (currentPage.worker_id !== this.workerId ||
    currentPage.status !== PageStatus.PROCESSING) {
  // 已被其他 Worker 处理或超时回退，跳过
  return;
}

if (task.status === TaskStatus.CANCELLED) {
  // 任务已取消，丢弃结果
  return;
}
```

### 5.4 进度计算

分阶段计算进度，提供更好的用户体验：

```typescript
function calculateProgress(task: Task): number {
  switch (task.status) {
    case TaskStatus.PENDING:
      return 0;
    case TaskStatus.SPLITTING:
      return 5; // 拆分占 5%
    case TaskStatus.PROCESSING:
      // 转换阶段占 5% ~ 95%
      return 5 + Math.floor((task.completed_count / task.pages) * 90);
    case TaskStatus.READY_TO_MERGE:
    case TaskStatus.MERGING:
      return 95;
    case TaskStatus.COMPLETED:
      return 100;
    default:
      return task.progress;
  }
}
```

### 5.5 并发控制

- **SplitterWorker**: 单实例，顺序处理
- **ConverterWorker**: 多实例，并发处理（可配置 N 个）
- **MergerWorker**: 单实例，顺序处理
- **HealthChecker**: 单实例，周期性检查

---

## 6. 特殊场景处理

### 6.1 单页重试

根据页面原状态决定减少哪个计数器：

```typescript
async retryPage(pageId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 获取页面当前状态
    const page = await tx.taskDetail.findUnique({
      where: { id: pageId }
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // 2. 根据原状态决定减少哪个计数器
    const wasCompleted = page.status === PageStatus.COMPLETED;
    const wasFailed = page.status === PageStatus.FAILED;

    if (!wasCompleted && !wasFailed) {
      throw new Error('Can only retry COMPLETED or FAILED pages');
    }

    // 3. 更新页面状态
    await tx.taskDetail.update({
      where: { id: pageId },
      data: {
        status: PageStatus.RETRYING,
        error: null
      }
    });

    // 4. 更新任务状态和计数器
    const task = await tx.task.findUnique({
      where: { id: page.task }
    });

    const updateData: any = {
      status: TaskStatus.PROCESSING
    };

    if (wasCompleted) {
      updateData.completed_count = { decrement: 1 };
    } else if (wasFailed) {
      updateData.failed_count = { decrement: 1 };
    }

    await tx.task.update({
      where: { id: page.task },
      data: updateData
    });
  });

  // ConverterWorker 会自动抢到 RETRYING 状态的页面
}
```

### 6.2 批量重试失败页面

```typescript
async retryFailedPages(taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 找到所有失败的页面
    const failedPages = await tx.taskDetail.findMany({
      where: {
        task: taskId,
        status: PageStatus.FAILED
      }
    });

    if (failedPages.length === 0) {
      return;
    }

    // 2. 更新所有失败页面为 RETRYING
    await tx.taskDetail.updateMany({
      where: {
        task: taskId,
        status: PageStatus.FAILED
      },
      data: {
        status: PageStatus.RETRYING,
        error: null
      }
    });

    // 3. 更新任务状态
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.PROCESSING,
        failed_count: { decrement: failedPages.length }
      }
    });
  });
}
```

### 6.3 重新合并

```typescript
async remerge(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.READY_TO_MERGE,
      merged_path: null // 清空旧的合并结果
    }
  });

  // MergerWorker 会自动抢占
}
```

### 6.4 取消任务

```typescript
async cancelTask(taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 更新任务状态
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.CANCELLED,
        worker_id: null
      }
    });

    // 2. 停止所有正在处理的页面（标记为 PENDING，但任务已取消所以不会被处理）
    await tx.taskDetail.updateMany({
      where: {
        task: taskId,
        status: PageStatus.PROCESSING
      },
      data: {
        status: PageStatus.PENDING,
        worker_id: null
      }
    });
  });

  // 注意：正在处理这些页面的 ConverterWorker 完成后会检查任务状态
  // 发现已取消会自动丢弃结果
}
```

### 6.5 完全重试任务

```typescript
async retryTask(taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 删除所有 TaskDetail
    await tx.taskDetail.deleteMany({
      where: { task: taskId }
    });

    // 2. 重置任务状态
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.PENDING,
        progress: 0,
        completed_count: 0,
        failed_count: 0,
        worker_id: null,
        merged_path: null,
        error: null
      }
    });
  });

  // SplitterWorker 会重新抢占并拆分
}
```

---

## 7. 资源清理策略

### 7.1 临时文件清理

临时文件（拆分后的图片）在以下时机清理：

1. **任务完成时**: MergerWorker 合并完成后立即清理
2. **任务取消时**: 由 CleanupWorker 清理
3. **任务删除时**: 删除前先清理相关文件

```typescript
class CleanupService {
  /**
   * 清理任务的临时文件
   */
  async cleanupTaskTempFiles(taskId: string): Promise<void> {
    const tempDir = path.join(TEMP_DIR, taskId);
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup temp files for task ${taskId}:`, error);
    }
  }

  /**
   * 清理任务的输出文件
   */
  async cleanupTaskOutputFiles(taskId: string): Promise<void> {
    const outputDir = path.join(OUTPUT_DIR, taskId);
    try {
      await fs.promises.rm(outputDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup output files for task ${taskId}:`, error);
    }
  }

  /**
   * 完全清理任务文件
   */
  async cleanupTaskFiles(taskId: string): Promise<void> {
    await Promise.all([
      this.cleanupTaskTempFiles(taskId),
      this.cleanupTaskOutputFiles(taskId)
    ]);
  }

  /**
   * 清理过期的临时文件（定期执行）
   */
  async cleanupStaleTempFiles(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const tempDir = TEMP_DIR;
    const cutoffTime = Date.now() - maxAgeMs;

    try {
      const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(tempDir, entry.name);
          const stats = await fs.promises.stat(dirPath);

          if (stats.mtimeMs < cutoffTime) {
            await fs.promises.rm(dirPath, { recursive: true, force: true });
            console.log(`[Cleanup] Removed stale temp directory: ${entry.name}`);
          }
        }
      }
    } catch (error) {
      console.error('[Cleanup] Error cleaning stale temp files:', error);
    }
  }
}
```

### 7.2 删除任务时的清理

```typescript
async deleteTask(taskId: string): Promise<void> {
  const cleanup = new CleanupService();

  await prisma.$transaction(async (tx) => {
    // 1. 获取任务信息（用于清理文件）
    const task = await tx.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    // 2. 删除 TaskDetail 记录
    await tx.taskDetail.deleteMany({
      where: { task: taskId }
    });

    // 3. 删除 Task 记录
    await tx.task.delete({
      where: { id: taskId }
    });
  });

  // 4. 清理文件（在事务外执行，避免长事务）
  await cleanup.cleanupTaskFiles(taskId);
}
```

---

## 8. 实施路线图

### 阶段 1: 数据库准备

- [ ] 更新 `schema.prisma`
  - [ ] 添加 Task 表新字段
  - [ ] 添加 TaskDetail 表新字段
  - [ ] 添加索引
- [ ] 执行数据库迁移
- [ ] 更新 TypeScript 类型定义

### 阶段 2: Worker 基础设施

- [ ] 实现 `WorkerBase` 抽象类
- [ ] 实现状态抢占机制
- [ ] 实现 `HealthChecker`
- [ ] 编写单元测试

### 阶段 3: 核心 Workers

- [ ] 实现 `SplitterWorker`
  - [ ] PDF 拆分逻辑
  - [ ] TaskDetail 批量创建
- [ ] 实现 `ConverterWorker`
  - [ ] 页面抢占逻辑
  - [ ] LLM 调用集成
  - [ ] 幂等性检查
  - [ ] 任务完成检测
- [ ] 实现 `MergerWorker`
  - [ ] Markdown 合并逻辑
  - [ ] 文件保存
  - [ ] 临时文件清理

### 阶段 4: 编排器和 API

- [ ] 实现 `TaskOrchestrator`
- [ ] 集成到主进程 `src/main/index.ts`
- [ ] 实现 IPC Handlers
  - [ ] 单页重试
  - [ ] 批量重试
  - [ ] 取消任务
  - [ ] 完全重试
- [ ] 实现 `CleanupService`

### 阶段 5: 前端集成

- [ ] 更新 List 页面
  - [ ] 显示新的状态文本
  - [ ] 添加操作按钮
- [ ] 实现 Preview 页面
  - [ ] 加载真实数据
  - [ ] 分页导航
  - [ ] 单页重试按钮
- [ ] 实时进度更新

### 阶段 6: 测试和优化

- [ ] 集成测试
  - [ ] 正常流程测试
  - [ ] 异常恢复测试
  - [ ] 并发测试
- [ ] 性能优化
  - [ ] 数据库查询优化
  - [ ] Worker 并发数调优
- [ ] 日志和监控

---

## 9. 配置参数

### 9.1 Worker 配置

```typescript
const WORKER_CONFIG = {
  // Converter Worker 数量
  converterCount: 3,

  // 轮询间隔（毫秒）
  pollInterval: 2000,

  // 任务超时时间（毫秒）
  taskTimeout: 5 * 60 * 1000, // 5分钟

  // 页面转换超时（毫秒）
  pageTimeout: 2 * 60 * 1000, // 2分钟

  // HealthChecker 检查间隔（毫秒）
  healthCheckInterval: 60000, // 1分钟
};
```

### 9.2 目录配置

```typescript
const DIRECTORY_CONFIG = {
  uploadDir: path.join(app.getPath('userData'), 'uploads'),
  tempDir: path.join(app.getPath('userData'), 'temp'),
  outputDir: path.join(app.getPath('userData'), 'output'),
};
```

---

## 10. 监控和日志

### 10.1 日志规范

每个 Worker 的日志格式：

```
[WorkerType-WorkerId] Action: Details
```

示例：

```
[Splitter-abc123] Claimed task task-001
[Splitter-abc123] Task task-001 split into 10 pages
[Converter-converter-0] Claimed page 1 of task task-001
[Converter-converter-0] Completed page 1 of task task-001
[Converter-converter-2] Task task-001: PROCESSING → READY_TO_MERGE
[Merger-xyz789] Task task-001 merged successfully
[HealthChecker] Reset 2 stuck pages
```

### 10.2 监控指标

建议监控的指标：

- 各状态的任务数量
- Worker 处理速度（页/分钟）
- 平均转换时间
- 失败率
- 队列长度

---

## 11. 常见问题

### Q1: 如果所有 ConverterWorker 都崩溃了怎么办？

A: HealthChecker 会在 5 分钟后将 PROCESSING 状态的页面回退到 PENDING，重启后的 Worker 会重新抢占。

### Q2: 如何扩展 ConverterWorker 数量？

A: 修改 `TaskOrchestrator` 的 `converterCount` 配置参数即可。

### Q3: 用户删除任务时如何清理文件？

A: 调用 `deleteTask()` 函数，它会先删除数据库记录，然后清理 `tempDir` 和 `outputDir` 中的相关文件。

### Q4: 如何支持暂停/恢复任务？

A: 添加新状态 `PAUSED`，暂停时将任务状态设为 `PAUSED`，Workers 跳过该状态。恢复时改回原状态。

### Q5: 两个 Worker 会不会同时检测到任务完成？

A: 不会。`UPDATE ... SET completed_count = completed_count + 1` 会获取行锁，并发的 UPDATE 会排队执行。只有一个 Worker 会看到 `finishedCount === pages`。

### Q6: 如果 Worker 完成页面时发现任务已取消怎么办？

A: Worker 在更新前会检查任务状态，发现 `CANCELLED` 状态会丢弃结果，不更新计数器。

---

## 附录

### A. 状态码速查表

| 状态码 | TaskStatus | 说明 |
|-------|-----------|------|
| 0 | FAILED | 失败 |
| 1 | PENDING | 等待拆分 |
| 2 | SPLITTING | 拆分中 |
| 3 | PROCESSING | 转换中 |
| 4 | READY_TO_MERGE | 准备合并 |
| 5 | MERGING | 合并中 |
| 6 | COMPLETED | 完成 |
| 7 | CANCELLED | 已取消 |
| 8 | PARTIAL_FAILED | 部分失败 |

| 状态码 | PageStatus | 说明 |
|-------|-----------|------|
| -1 | FAILED | 失败 |
| 0 | PENDING | 等待转换 |
| 1 | PROCESSING | 转换中 |
| 2 | COMPLETED | 完成 |
| 3 | RETRYING | 重试中 |

### B. 参考资料

- [Prisma Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [Optimistic Concurrency Control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)
- [State Machine Pattern](https://refactoring.guru/design-patterns/state)

---

**文档结束**
