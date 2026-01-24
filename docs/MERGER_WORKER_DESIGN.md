# MergerWorker 详细设计方案

> **版本**: v1.1
> **创建日期**: 2026-01-24
> **基于**: TASK_STATE_DESIGN.md v2.0
> **设计目标**: 实现 Markdown 页面合并，完成任务处理流程的最后一环

---

## 目录

- [1. 概述](#1-概述)
- [2. 架构设计](#2-架构设计)
- [3. 核心流程](#3-核心流程)
- [4. 详细实现](#4-详细实现)
- [5. 文件路径规范](#5-文件路径规范)
- [6. 错误处理](#6-错误处理)
- [7. 集成指南](#7-集成指南)
- [8. 配置参数](#8-配置参数)
- [9. 测试用例](#9-测试用例)

---

## 1. 概述

### 1.1 职责定义

MergerWorker 是任务处理流水线的最后一个环节，负责：

1. **监听就绪任务**: 轮询 `READY_TO_MERGE` 状态的任务
2. **合并 Markdown**: 按页码顺序合并所有已完成页面的 Markdown 内容
3. **写入文件**: 将合并后的内容写入磁盘
4. **更新状态**: 将任务状态更新为 `COMPLETED`

### 1.2 在流水线中的位置

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│  Splitter   │───▶│   Converter     │───▶│   Merger    │
│   Worker    │    │   Worker Pool   │    │   Worker    │
│  (拆分PDF)   │    │  (页面→Markdown)│    │ (合并Markdown)│
└─────────────┘    └─────────────────┘    └─────────────┘
     │                     │                     │
     ▼                     ▼                     ▼
  PENDING              PROCESSING          READY_TO_MERGE
     ↓                     ↓                     ↓
  SPLITTING            完成后自动             MERGING
     ↓                 检测转换                  ↓
  PROCESSING              ↓                 COMPLETED
                    READY_TO_MERGE
```

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **单实例** | 同一时间只运行一个 MergerWorker 实例 |
| **幂等性** | 支持重复合并，结果一致 |
| **原子性** | 状态转换通过数据库事务保证原子性 |
| **容错性** | 支持超时恢复和异常重试 |
| **无清理** | 合并完成后不删除临时文件，保留预览能力 |

---

## 2. 架构设计

### 2.1 类图

```
┌─────────────────────────────────────────────────────────┐
│                      WorkerBase                          │
├─────────────────────────────────────────────────────────┤
│ # workerId: string                                       │
│ # isRunning: boolean                                     │
├─────────────────────────────────────────────────────────┤
│ + run(): Promise<void>                     [abstract]    │
│ + stop(): void                                           │
│ # claimTask(from, to): Promise<Task | null>             │
│ # updateTaskStatus(id, status, data?): Promise<void>    │
│ # handleError(id, error): Promise<void>                 │
│ # sleep(ms): Promise<void>                              │
└─────────────────────────────────────────────────────────┘
                           △
                           │ extends
                           │
┌─────────────────────────────────────────────────────────┐
│                     MergerWorker                         │
├─────────────────────────────────────────────────────────┤
│ - uploadsDir: string                                     │
│ - currentTaskId: string | null                           │
├─────────────────────────────────────────────────────────┤
│ + constructor(uploadsDir: string)                        │
│ + run(): Promise<void>                                   │
│ + stop(): void                              [override]   │
│ - releaseCurrentTask(): Promise<void>                    │
│ - getCompletedPages(taskId): Promise<CompletedPage[]>   │
│ - mergeMarkdown(pages): string                          │
│ - getOutputPath(task): string                           │
│ - saveMergedFile(task, content): Promise<string>        │
│ - ensureDirectoryExists(dirPath): Promise<void>         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 依赖关系

```typescript
// 外部依赖
import fs from 'fs/promises';
import path from 'path';

// 内部依赖
import { WorkerBase } from './WorkerBase.js';
import { prisma } from '../db/index.js';
import { TaskStatus } from '../types/TaskStatus.js';
import { PageStatus } from '../types/PageStatus.js';
import { WORKER_CONFIG } from '../config/worker.config.js';
import { eventBus, TaskEventType } from '../events/EventBus.js';
```

---

## 3. 核心流程

### 3.1 主循环流程图

```
              ┌─────────────────────┐
              │       开始          │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   isRunning = true   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
       ┌──────│    isRunning?       │
       │      └──────────┬──────────┘
       │                 │ Yes
       │                 ▼
       │      ┌─────────────────────┐
       │      │   claimTask()       │
       │      │  READY_TO_MERGE →   │
       │      │     MERGING         │
       │      └──────────┬──────────┘
       │                 │
       │      ┌──────────▼──────────┐
       │      │    有任务吗?         │──────┐
       │      └──────────┬──────────┘      │
       │                 │ Yes             │ No
       │                 ▼                 ▼
       │      ┌─────────────────────┐   ┌──────────────┐
       │      │  getCompletedPages  │   │   sleep()    │
       │      └──────────┬──────────┘   └──────┬───────┘
       │                 │                     │
       │                 ▼                     │
       │      ┌─────────────────────┐         │
       │      │   mergeMarkdown()   │         │
       │      └──────────┬──────────┘         │
       │                 │                     │
       │                 ▼                     │
       │      ┌─────────────────────┐         │
       │      │   saveMergedFile()  │         │
       │      └──────────┬──────────┘         │
       │                 │                     │
       │                 ▼                     │
       │      ┌─────────────────────┐         │
       │      │  updateTaskStatus   │         │
       │      │    → COMPLETED      │         │
       │      └──────────┬──────────┘         │
       │                 │                     │
       │                 └─────────────────────┘
       │                           │
       │                           │
       │ No (停止)                  │
       └───────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │        结束         │
              └─────────────────────┘
```

### 3.2 状态转换

| 当前状态 | 触发条件 | 目标状态 | 执行者 |
|---------|---------|---------|--------|
| READY_TO_MERGE | MergerWorker 抢占 | MERGING | MergerWorker |
| MERGING | 合并成功 | COMPLETED | MergerWorker |
| MERGING | 合并失败 | FAILED | MergerWorker |
| MERGING | 超时恢复 | READY_TO_MERGE | HealthChecker/cleanupOrphanedWork |

### 3.3 时序图

```
User          TaskLogic        MergerWorker       Database         FileSystem
 │                │                 │                │                 │
 │  start()       │                 │                │                 │
 │───────────────▶│                 │                │                 │
 │                │  new Worker()   │                │                 │
 │                │────────────────▶│                │                 │
 │                │                 │                │                 │
 │                │    run()        │                │                 │
 │                │────────────────▶│                │                 │
 │                │                 │                │                 │
 │                │                 │◀───────────────│                 │
 │                │                 │  Poll: READY   │                 │
 │                │                 │───────────────▶│                 │
 │                │                 │                │                 │
 │                │                 │  claimTask     │                 │
 │                │                 │───────────────▶│                 │
 │                │                 │◀───────────────│                 │
 │                │                 │  Task claimed  │                 │
 │                │                 │                │                 │
 │                │                 │  getPages      │                 │
 │                │                 │───────────────▶│                 │
 │                │                 │◀───────────────│                 │
 │                │                 │  TaskDetails   │                 │
 │                │                 │                │                 │
 │                │                 │  mergeMarkdown │                 │
 │                │                 │──────────┐     │                 │
 │                │                 │◀─────────┘     │                 │
 │                │                 │                │                 │
 │                │                 │                │  writeFile      │
 │                │                 │────────────────│────────────────▶│
 │                │                 │                │◀────────────────│
 │                │                 │                │                 │
 │                │                 │  updateStatus  │                 │
 │                │                 │───────────────▶│                 │
 │                │                 │◀───────────────│                 │
 │                │                 │  COMPLETED     │                 │
 │                │                 │                │                 │
```

---

## 4. 详细实现

### 4.1 MergerWorker 类

```typescript
import fs from 'fs/promises';
import path from 'path';
import { WorkerBase } from './WorkerBase.js';
import { prisma } from '../db/index.js';
import { Task, TaskStatus } from '../types/index.js';
import { PageStatus } from '../types/PageStatus.js';
import { WORKER_CONFIG } from '../config/worker.config.js';

/**
 * 已完成页面的精简类型（仅包含合并所需字段）
 * 使用 Prisma 查询结果的类型推断
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
      merged_path: outputPath,
      progress: 100,
      worker_id: null, // 释放 worker 占用
    });

    console.log(`[Merger-${this.workerId.slice(0, 8)}] Task ${task.id} merged successfully: ${outputPath}`);
  }

  /**
   * 获取任务的所有已完成页面
   *
   * 使用 Prisma 的类型推断，返回仅包含合并所需字段的页面列表。
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
    const { name } = path.parse(task.filename);
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
    // 注意：content 中的换行符已经是 LF，无需转换
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
```

### 4.2 重要实现细节

#### 4.2.1 任务抢占

MergerWorker 继承自 `WorkerBase`，使用基类提供的 `claimTask()` 方法进行原子性任务抢占。

基类的 `claimTask()` 方法已经实现了：
- Prisma 事务确保原子性
- 事务成功后自动发射 `TASK_UPDATED` 和 `TASK_STATUS_CHANGED` 事件
- 异常处理和日志记录

> **注意**: 基类的事务实现足以保证单实例 MergerWorker 的正确性。如果未来需要多实例并发，
> 应考虑添加 `{ isolationLevel: 'Serializable' }` 配置，参考 `ConverterWorker` 的实现。

抢占流程示意（在 WorkerBase 中实现）：

```typescript
// WorkerBase.claimTask() 已实现的逻辑
const claimed = await prisma.$transaction(async (tx) => {
  // 1. 查找第一个可用的待合并任务
  const task = await tx.task.findFirst({
    where: {
      status: TaskStatus.READY_TO_MERGE,
      worker_id: null,
    },
    orderBy: {
      createdAt: 'asc', // FIFO 顺序
    },
  });

  if (!task) return null;

  // 2. 原子更新状态和 worker_id
  return await tx.task.update({
    where: { id: task.id },
    data: {
      status: TaskStatus.MERGING,
      worker_id: this.workerId,
      updatedAt: new Date(),
    },
  });
});

// 3. 事务成功后发射事件（基类自动处理）
if (claimed) {
  eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, { ... });
  eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, { ... });
}
```

#### 4.2.2 合并格式

合并后的 Markdown 文件格式示例：

```markdown
<!-- Page 1 -->

# 文档标题

这是第一页的内容...

---

<!-- Page 2 -->

## 第二章

这是第二页的内容...

---

<!-- Page 3 -->

### 2.1 小节

这是第三页的内容...
```

#### 4.2.3 幂等性保证

MergerWorker 的合并操作具有幂等性：

1. **文件覆盖**: 如果输出文件已存在，会被覆盖
2. **状态检查**: 只处理 `READY_TO_MERGE` 状态的任务
3. **数据一致**: 每次合并都从数据库读取最新的页面内容

---

## 5. 文件路径规范

### 5.1 目录结构

```
{uploadsDir}/
└── {taskId}/
    ├── {original_filename}     # 原始上传文件 (如 document.pdf)
    ├── {original_basename}.md  # 合并后的 Markdown (如 document.md)
    └── split/
        ├── page-1.png          # 拆分后的页面图片
        ├── page-2.png
        └── ...
```

### 5.2 路径计算

| 路径类型 | 计算方式 | 示例 |
|---------|---------|------|
| 任务目录 | `{uploadsDir}/{taskId}` | `files/abc123` |
| 分割目录 | `{uploadsDir}/{taskId}/split` | `files/abc123/split` |
| 输出文件 | `{uploadsDir}/{taskId}/{basename}.md` | `files/abc123/report.md` |

### 5.3 文件命名规则

- **输入**: `report.pdf`, `presentation.pptx`, `image.png`
- **输出**: `report.md`, `presentation.md`, `image.md`

转换规则：保留原文件的基础名，扩展名统一改为 `.md`

---

## 6. 错误处理

### 6.1 错误类型与处理策略

| 错误类型 | 处理策略 | 恢复方式 |
|---------|---------|---------|
| 无已完成页面 | 标记任务为 FAILED | 用户重试 |
| 文件写入失败 | 标记任务为 FAILED | 检查磁盘空间后重试 |
| 数据库错误 | 记录日志，继续轮询 | 自动重试 |
| Worker 崩溃 | HealthChecker 恢复 | 自动恢复到 READY_TO_MERGE |

### 6.2 错误处理代码

```typescript
// handleError 方法（继承自 WorkerBase）
protected async handleError(taskId: string, error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(`[Merger-${this.workerId.slice(0, 8)}] Task ${taskId} failed:`, errorMessage);

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.FAILED,
      error: errorMessage,
      worker_id: null, // 释放占用
      updatedAt: new Date(),
    },
  });

  // 发送事件通知
  eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
    taskId,
    task: { status: TaskStatus.FAILED },
    timestamp: Date.now(),
  });
}
```

### 6.3 超时恢复

当 MergerWorker 在合并过程中崩溃时，`TaskLogic.cleanupOrphanedWork()` 会在应用重启时恢复：

```typescript
// 重置孤立的 MERGING 任务
const orphanedMergingTasks = await prisma.task.updateMany({
  where: {
    status: TaskStatus.MERGING,
    worker_id: { not: null },
  },
  data: {
    status: TaskStatus.READY_TO_MERGE,
    worker_id: null,
  },
});
```

---

## 7. 集成指南

### 7.1 导出 Worker

更新 `src/server/workers/index.ts`:

```typescript
// 当前内容
export { WorkerBase } from './WorkerBase.js';
export { SplitterWorker } from './SplitterWorker.js';
export { ConverterWorker } from './ConverterWorker.js';

// 新增以下行
export { MergerWorker } from './MergerWorker.js';
```

### 7.2 集成到 TaskLogic

更新 `src/server/logic/Task.ts`:

#### 7.2.1 导入语句

```typescript
// 更新导入，添加 MergerWorker
import { SplitterWorker, ConverterWorker, MergerWorker } from '../workers/index.js';
```

#### 7.2.2 类属性

```typescript
class TaskLogic {
  private isRunning: boolean;
  private splitterWorker: SplitterWorker | null;
  private converterWorkers: ConverterWorker[];
  private mergerWorker: MergerWorker | null;  // 新增
  private uploadsDir: string;

  constructor() {
    this.isRunning = false;
    this.splitterWorker = null;
    this.converterWorkers = [];
    this.mergerWorker = null;  // 新增
    this.uploadsDir = fileLogic.getUploadDir();
  }
  // ...
}
```

#### 7.2.3 start() 方法

在 `start()` 方法中，ConverterWorkers 启动后添加：

```typescript
async start() {
  // ... 现有代码（cleanupOrphanedWork、ImagePathUtil.init、SplitterWorker、ConverterWorkers）...

  // Start MergerWorker (新增，放在 ConverterWorkers 之后)
  this.mergerWorker = new MergerWorker(this.uploadsDir);
  console.log(`[TaskLogic] MergerWorker created (ID: ${this.mergerWorker.getWorkerId().slice(0, 8)})`);

  this.mergerWorker.run().catch((error) => {
    console.error('[TaskLogic] MergerWorker error:', error);
  });

  this.isRunning = true;
  console.log('[TaskLogic] All workers started successfully');
}
```

#### 7.2.4 stop() 方法

在 `stop()` 方法中，ConverterWorkers 停止后添加：

```typescript
async stop() {
  // ... 现有代码（SplitterWorker、ConverterWorkers 停止）...

  // Stop MergerWorker (新增)
  if (this.mergerWorker) {
    this.mergerWorker.stop();
    console.log(`[TaskLogic] MergerWorker ${this.mergerWorker.getWorkerId().slice(0, 8)} stopped`);
    this.mergerWorker = null;
  }

  this.isRunning = false;
  console.log('[TaskLogic] All workers stopped');
}
```

#### 7.2.5 getWorkerInfo() 方法

```typescript
getWorkerInfo() {
  return {
    isRunning: this.isRunning,
    splitterWorker: this.splitterWorker ? {
      id: this.splitterWorker.getWorkerId(),
      running: this.splitterWorker.getIsRunning(),
    } : null,
    converterWorkers: this.converterWorkers.map((worker) => ({
      id: worker.getWorkerId().slice(0, 8),
      running: worker.getIsRunning(),
    })),
    // 新增 mergerWorker，格式与 converterWorkers 保持一致
    mergerWorker: this.mergerWorker ? {
      id: this.mergerWorker.getWorkerId().slice(0, 8),
      running: this.mergerWorker.getIsRunning(),
    } : null,
    directories: {
      uploads: this.uploadsDir,
    },
  };
}
```

### 7.3 Worker 启动顺序

```
1. cleanupOrphanedWork()    # 清理上次异常关闭的残留
2. ImagePathUtil.init()      # 初始化路径工具
3. SplitterWorker.run()      # 启动拆分器
4. ConverterWorker[].run()   # 启动转换器池
5. MergerWorker.run()        # 启动合并器 (新增)
```

> **顺序说明**: MergerWorker 放在最后启动是因为它依赖前面的 Worker 产出的数据。
> 停止时按相反顺序，先停止 MergerWorker，再停止 ConverterWorkers 和 SplitterWorker。

---

## 8. 配置参数

### 8.1 现有配置

`src/server/config/worker.config.ts` 中已定义：

```typescript
merger: {
  /** Poll interval for checking tasks ready to merge (ms) */
  pollInterval: 2000,
},
```

### 8.2 建议扩展配置

如果未来需要更多配置，可以扩展：

```typescript
merger: {
  /** Poll interval for checking tasks ready to merge (ms) */
  pollInterval: 2000,
  /** Maximum merged file size (bytes). Files exceeding this will fail with error. */
  maxFileSize: 100 * 1024 * 1024, // 100MB
  /** Page separator format */
  pageSeparator: '\n\n---\n\n',
  /** Include page comments in output */
  includePageComments: true,
},
```

### 8.3 大文件处理考虑

当前实现将所有页面内容加载到内存后一次性写入文件。对于大多数使用场景（几十到几百页的 PDF），这种方式足够高效。

#### 内存占用估算

| 页面数 | 平均每页字符数 | 估计内存占用 |
|--------|---------------|-------------|
| 50     | 2000          | ~200KB      |
| 200    | 2000          | ~800KB      |
| 500    | 2000          | ~2MB        |
| 1000   | 2000          | ~4MB        |

> **结论**: 对于常见的文档规模，内存占用在可接受范围内。

#### 未来优化方向（如需要）

如果未来需要处理超大文档（数千页），可以考虑：

1. **流式写入**: 使用 `fs.createWriteStream()` 逐页写入
2. **分块处理**: 每次从数据库读取一批页面（如 100 页）
3. **文件大小限制**: 在合并前检查预估大小，超出限制时报错

```typescript
// 流式写入示例（未来优化）
private async saveMergedFileStreaming(task: Task, taskId: string): Promise<string> {
  const outputPath = this.getOutputPath(task);
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  const pageCount = await prisma.taskDetail.count({
    where: { task: taskId, status: PageStatus.COMPLETED },
  });

  for (let offset = 0; offset < pageCount; offset += 100) {
    const pages = await prisma.taskDetail.findMany({
      where: { task: taskId, status: PageStatus.COMPLETED },
      orderBy: { page: 'asc' },
      skip: offset,
      take: 100,
      select: { page: true, content: true },
    });

    for (const page of pages) {
      if (offset > 0 || page.page > 1) {
        writeStream.write('\n\n---\n\n');
      }
      writeStream.write(`<!-- Page ${page.page} -->\n\n${page.content}`);
    }
  }

  writeStream.end();
  return outputPath;
}
```

---

## 9. 测试用例

### 9.1 单元测试

```typescript
describe('MergerWorker', () => {
  describe('mergeMarkdown', () => {
    it('should merge pages in correct order', () => {
      const pages = [
        { page: 1, content: 'Page 1 content' },
        { page: 2, content: 'Page 2 content' },
      ];

      const result = worker['mergeMarkdown'](pages);

      expect(result).toContain('<!-- Page 1 -->');
      expect(result).toContain('<!-- Page 2 -->');
      expect(result.indexOf('Page 1')).toBeLessThan(result.indexOf('Page 2'));
    });

    it('should use correct separator between pages', () => {
      const pages = [
        { page: 1, content: 'Content 1' },
        { page: 2, content: 'Content 2' },
      ];

      const result = worker['mergeMarkdown'](pages);

      expect(result).toContain('\n\n---\n\n');
    });
  });

  describe('getOutputPath', () => {
    it('should replace file extension with .md', () => {
      const task = { id: 'task-123', filename: 'document.pdf' };

      const outputPath = worker['getOutputPath'](task);

      expect(outputPath).toMatch(/document\.md$/);
    });

    it('should handle filenames without extension', () => {
      const task = { id: 'task-123', filename: 'document' };

      const outputPath = worker['getOutputPath'](task);

      expect(outputPath).toMatch(/document\.md$/);
    });

    it('should handle filenames with multiple dots', () => {
      const task = { id: 'task-123', filename: 'my.report.2024.pdf' };

      const outputPath = worker['getOutputPath'](task);

      expect(outputPath).toMatch(/my\.report\.2024\.md$/);
    });

    it('should handle hidden files (starting with dot)', () => {
      const task = { id: 'task-123', filename: '.hidden.pdf' };

      const outputPath = worker['getOutputPath'](task);

      // path.parse('.hidden.pdf') => { name: '.hidden', ext: '.pdf' }
      expect(outputPath).toMatch(/\.hidden\.md$/);
    });

    it('should handle files with only extension-like name', () => {
      const task = { id: 'task-123', filename: '.gitignore' };

      const outputPath = worker['getOutputPath'](task);

      // path.parse('.gitignore') => { name: '.gitignore', ext: '' }
      expect(outputPath).toMatch(/\.gitignore\.md$/);
    });
  });

  describe('stop', () => {
    it('should release current task when stopped during processing', async () => {
      const task = await createTestTask({ status: TaskStatus.READY_TO_MERGE });
      const worker = new MergerWorker(uploadsDir);

      // 模拟正在处理任务
      worker['currentTaskId'] = task.id;

      // 调用 stop
      worker.stop();

      // 等待异步释放完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证任务被释放
      const updatedTask = await getTask(task.id);
      expect(updatedTask.status).toBe(TaskStatus.READY_TO_MERGE);
      expect(updatedTask.worker_id).toBeNull();
    });

    it('should not throw when no task is being processed', () => {
      const worker = new MergerWorker(uploadsDir);

      expect(() => worker.stop()).not.toThrow();
    });
  });
});
```

### 9.2 集成测试

```typescript
describe('MergerWorker Integration', () => {
  it('should merge task and update status to COMPLETED', async () => {
    // 1. 创建测试任务和页面
    const task = await createTestTask({ status: TaskStatus.READY_TO_MERGE });
    await createTestPages(task.id, [
      { page: 1, content: 'Page 1', status: PageStatus.COMPLETED },
      { page: 2, content: 'Page 2', status: PageStatus.COMPLETED },
    ]);

    // 2. 运行 MergerWorker
    const worker = new MergerWorker(uploadsDir);
    await worker['mergeTask'](task);

    // 3. 验证结果
    const updatedTask = await getTask(task.id);
    expect(updatedTask.status).toBe(TaskStatus.COMPLETED);
    expect(updatedTask.merged_path).toBeDefined();
    expect(updatedTask.progress).toBe(100);

    // 4. 验证文件内容
    const content = await fs.readFile(updatedTask.merged_path!, 'utf-8');
    expect(content).toContain('Page 1');
    expect(content).toContain('Page 2');
  });

  it('should handle empty completed pages gracefully', async () => {
    const task = await createTestTask({ status: TaskStatus.READY_TO_MERGE });
    // 没有创建任何完成的页面

    const worker = new MergerWorker(uploadsDir);

    await expect(worker['mergeTask'](task)).rejects.toThrow('No completed pages');
  });
});
```

### 9.3 端到端测试场景

| 场景 | 预期结果 |
|------|---------|
| 正常合并 | 状态变为 COMPLETED，merged_path 有值 |
| 无已完成页面 | 状态变为 FAILED，error 记录原因 |
| Worker 中途崩溃 | 重启后任务恢复到 READY_TO_MERGE |
| 并发抢占 | 只有一个 Worker 能抢到任务 |
| 重复合并 | 文件被覆盖，内容保持一致 |
| 优雅停止（处理中） | 当前任务释放回 READY_TO_MERGE |
| 优雅停止（空闲） | Worker 正常停止，无副作用 |
| 特殊文件名 | `.hidden.pdf`、`a.b.c.pdf` 等正确处理 |

---

## 附录

### A. 状态码速查

| 状态码 | TaskStatus | MergerWorker 相关 |
|-------|-----------|------------------|
| 4 | READY_TO_MERGE | 输入状态（等待合并） |
| 5 | MERGING | 处理中状态 |
| 6 | COMPLETED | 输出状态（成功） |
| 0 | FAILED | 输出状态（失败） |

### B. 日志示例

日志前缀格式说明：
- `[TaskLogic]` - 任务编排层日志
- `[Merger-xxxxxxxx]` - MergerWorker 日志，xxxxxxxx 为 workerId 前 8 位

> **一致性说明**: MergerWorker 使用 `[Merger-${workerId.slice(0, 8)}]` 前缀，
> 与 ConverterWorker 的 `[Converter-${workerId.slice(0, 8)}]` 保持一致的命名风格。

```
[TaskLogic] MergerWorker created (ID: a1b2c3d4)
[Merger-a1b2c3d4] Started
[Merger-a1b2c3d4] Claimed task task-001
[Merger-a1b2c3d4] Merging 10 pages for task task-001
[Merger-a1b2c3d4] Task task-001 merged successfully: files/task-001/document.md
[Merger-a1b2c3d4] Claimed task task-002
[Merger-a1b2c3d4] Failed to merge task task-002: No completed pages found for merging
[Merger-a1b2c3d4] Stopping...
[Merger-a1b2c3d4] Released task task-003
[Merger-a1b2c3d4] Stopped
```

### C. 相关文档

- [TASK_STATE_DESIGN.md](./TASK_STATE_DESIGN.md) - 任务状态机设计
- [SPLITTER_WORKER_DESIGN.md](./SPLITTER_WORKER_DESIGN.md) - 拆分器设计（如果存在）
- [CONVERTER_WORKER_DESIGN.md](./CONVERTER_WORKER_DESIGN.md) - 转换器设计（如果存在）

---

**文档结束**
