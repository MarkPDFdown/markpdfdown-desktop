# MergerWorker 详细设计方案

> **版本**: v1.0
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
├─────────────────────────────────────────────────────────┤
│ + constructor(uploadsDir: string)                        │
│ + run(): Promise<void>                                   │
│ - getCompletedPages(taskId): Promise<TaskDetail[]>      │
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
 */
export class MergerWorker extends WorkerBase {
  /** 上传文件根目录 */
  private readonly uploadsDir: string;

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

        console.log(`[Merger-${this.workerId.slice(0, 8)}] Claimed task ${task.id}`);

        try {
          // 执行合并流程
          await this.mergeTask(task);
        } catch (error) {
          // 合并失败，记录错误并更新状态
          console.error(`[Merger-${this.workerId.slice(0, 8)}] Failed to merge task ${task.id}:`, error);
          await this.handleError(task.id!, error);
        }
      } catch (error) {
        // 主循环级别的错误，记录但继续运行
        console.error(`[Merger-${this.workerId.slice(0, 8)}] Unexpected error in main loop:`, error);
        await this.sleep(WORKER_CONFIG.merger.pollInterval);
      }
    }

    console.log(`[Merger-${this.workerId.slice(0, 8)}] Stopped`);
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
   * @param taskId - 任务 ID
   * @returns 已完成的页面列表，按页码排序
   */
  private async getCompletedPages(taskId: string): Promise<TaskDetailRecord[]> {
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
  private mergeMarkdown(pages: TaskDetailRecord[]): string {
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
   * 路径格式: {uploadsDir}/{taskId}/{filename}.md
   * 例如: files/abc123/document.md (原文件为 document.pdf)
   *
   * @param task - 任务对象
   * @returns 输出文件的完整路径
   */
  private getOutputPath(task: Task): string {
    // 从原文件名获取基础名（去掉扩展名）
    const originalName = task.filename;
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    const outputFileName = `${baseName}.md`;

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

/**
 * TaskDetail 记录的精简类型（仅包含合并所需字段）
 */
interface TaskDetailRecord {
  page: number;
  content: string;
}
```

### 4.2 重要实现细节

#### 4.2.1 任务抢占

MergerWorker 继承自 `WorkerBase`，使用基类提供的 `claimTask()` 方法进行原子性任务抢占：

```typescript
// 抢占流程（在 WorkerBase 中实现）
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
export { WorkerBase } from './WorkerBase.js';
export { SplitterWorker } from './SplitterWorker.js';
export { ConverterWorker } from './ConverterWorker.js';
export { MergerWorker } from './MergerWorker.js';  // 新增
```

### 7.2 集成到 TaskLogic

更新 `src/server/logic/Task.ts`:

```typescript
import { SplitterWorker, ConverterWorker, MergerWorker } from '../workers/index.js';

class TaskLogic {
  private splitterWorker: SplitterWorker | null;
  private converterWorkers: ConverterWorker[];
  private mergerWorker: MergerWorker | null;  // 新增

  constructor() {
    // ...
    this.mergerWorker = null;  // 新增
  }

  async start() {
    // ... 现有代码 ...

    // Start MergerWorker (新增)
    this.mergerWorker = new MergerWorker(this.uploadsDir);
    console.log(`[TaskLogic] MergerWorker created (ID: ${this.mergerWorker.getWorkerId().slice(0, 8)})`);

    this.mergerWorker.run().catch((error) => {
      console.error('[TaskLogic] MergerWorker error:', error);
    });

    // ...
  }

  async stop() {
    // ... 现有代码 ...

    // Stop MergerWorker (新增)
    if (this.mergerWorker) {
      this.mergerWorker.stop();
      console.log(`[TaskLogic] MergerWorker ${this.mergerWorker.getWorkerId().slice(0, 8)} stopped`);
      this.mergerWorker = null;
    }

    // ...
  }

  getWorkerInfo() {
    return {
      // ... 现有字段 ...
      mergerWorker: this.mergerWorker ? {  // 新增
        id: this.mergerWorker.getWorkerId().slice(0, 8),
        running: this.mergerWorker.getIsRunning(),
      } : null,
    };
  }
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
  /** Maximum file size for single write operation (bytes) */
  maxFileSize: 100 * 1024 * 1024, // 100MB
  /** Page separator format */
  pageSeparator: '\n\n---\n\n',
  /** Include page comments in output */
  includePageComments: true,
},
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

      const path = worker['getOutputPath'](task);

      expect(path).toMatch(/document\.md$/);
    });

    it('should handle filenames without extension', () => {
      const task = { id: 'task-123', filename: 'document' };

      const path = worker['getOutputPath'](task);

      expect(path).toMatch(/document\.md$/);
    });

    it('should handle filenames with multiple dots', () => {
      const task = { id: 'task-123', filename: 'my.report.2024.pdf' };

      const path = worker['getOutputPath'](task);

      expect(path).toMatch(/my\.report\.2024\.md$/);
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

```
[TaskLogic] MergerWorker created (ID: a1b2c3d4)
[Merger-a1b2c3d4] Started
[Merger-a1b2c3d4] Claimed task task-001
[Merger-a1b2c3d4] Merging 10 pages for task task-001
[Merger-a1b2c3d4] Task task-001 merged successfully: files/task-001/document.md
[Merger-a1b2c3d4] Claimed task task-002
[Merger-a1b2c3d4] Failed to merge task task-002: No completed pages found for merging
[Merger-a1b2c3d4] Stopped
```

### C. 相关文档

- [TASK_STATE_DESIGN.md](./TASK_STATE_DESIGN.md) - 任务状态机设计
- [SPLITTER_WORKER_DESIGN.md](./SPLITTER_WORKER_DESIGN.md) - 拆分器设计（如果存在）
- [CONVERTER_WORKER_DESIGN.md](./CONVERTER_WORKER_DESIGN.md) - 转换器设计（如果存在）

---

**文档结束**
