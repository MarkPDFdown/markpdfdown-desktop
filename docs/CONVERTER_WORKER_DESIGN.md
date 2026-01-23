# ConverterWorker 详细设计方案

> **版本**: v1.2
> **创建日期**: 2026-01-23
> **更新日期**: 2026-01-24
> **设计目标**: 实现高效、可靠的页面转换 Worker，支持流式响应、自动重试、成本追踪
> **重要提示**: 本版本修复了 v1.1 的所有严重设计缺陷，包括 SQLite 兼容性、API 不匹配、并发安全等问题

---

## 目录

- [1. 概述](#1-概述)
- [2. 数据库 Schema 变更](#2-数据库-schema-变更)
- [3. 核心实现](#3-核心实现)
- [4. 流式响应机制](#4-流式响应机制)
- [5. 错误处理和重试](#5-错误处理和重试)
- [6. 性能优化](#6-性能优化)
- [7. 集成点](#7-集成点)
- [8. 测试策略](#8-测试策略)
- [9. 实施步骤](#9-实施步骤)

---

## 1. 概述

### 1.1 设计要求

基于用户需求和 `TASK_STATE_DESIGN.md`，ConverterWorker 需要实现：

1. **重试策略**: Worker 内部实现自动重试 3 次（指数退避：1s → 2s → 4s），失败后标记单页为 FAILED
2. **流式响应**: 支持 LLM 流式响应，实时更新转换进度（每 500ms 节流更新）
3. **成本追踪**: 记录每页的 input_tokens、output_tokens 和转换耗时
4. **图片处理**: 保持原图质量，直接使用 Splitter 生成的 2x 高清图片

### 1.2 现有基础设施

| 组件 | 状态 | 文件路径 |
|------|------|----------|
| WorkerBase 基类 | ✅ 已实现 | `src/server/workers/WorkerBase.ts` |
| LLMClient 抽象 | ✅ 已实现 | `src/server/logic/llm/LLMClient.ts` |
| ImagePathUtil | ✅ 已实现 | `src/server/logic/split/ImagePathUtil.ts` |
| Model.ts (LLM 调用) | ✅ 已实现 | `src/server/logic/Model.ts` |
| TaskDal / TaskDetailDal | ✅ 已实现 | `src/server/dal/` |
| EventBus | ✅ 已实现 | `src/server/events/EventBus.ts` |

---

## 2. 数据库 Schema 变更

### 2.1 新增字段

在 `TaskDetail` 表添加以下字段：

```prisma
model TaskDetail {
  // ... 现有字段 ...

  // 成本追踪
  input_tokens    Int      @default(0)   // 输入 token 数
  output_tokens   Int      @default(0)   // 输出 token 数

  // 性能指标
  conversion_time Int      @default(0)   // 转换耗时（毫秒）
  started_at      DateTime?              // 开始转换时间
  completed_at    DateTime?              // 完成转换时间
}
```

### 2.2 Migration 脚本

**执行命令**:
```bash
npx prisma migrate dev --name add_taskdetail_metrics
```

**SQL 内容** (自动生成):
```sql
ALTER TABLE "TaskDetail" ADD COLUMN "input_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskDetail" ADD COLUMN "output_tokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskDetail" ADD COLUMN "conversion_time" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskDetail" ADD COLUMN "started_at" DATETIME;
ALTER TABLE "TaskDetail" ADD COLUMN "completed_at" DATETIME;
```

### 2.3 TypeScript 类型更新

更新 `src/server/types/TaskDetail.ts` (如果存在):
```typescript
export interface TaskDetail {
  // ... 现有字段 ...
  input_tokens: number;
  output_tokens: number;
  conversion_time: number;
  started_at: Date | null;
  completed_at: Date | null;
}
```

---

## 3. 核心实现

### 3.1 ConverterWorker 类结构

**文件路径**: `src/server/workers/ConverterWorker.ts`

```typescript
import { WorkerBase } from './WorkerBase.js';
import { TaskStatus } from '../types/TaskStatus.js';
import { PageStatus } from '../types/PageStatus.js';
import { ImagePathUtil } from '../logic/split/ImagePathUtil.js';
import modelLogic from '../logic/Model.js'; // ✅ 修复: 使用 default import
import { eventBus, TaskEventType } from '../events/EventBus.js';
import { prisma } from '../db/index.js';
import { WORKER_CONFIG } from '../config/worker.config.js';

export class ConverterWorker extends WorkerBase {
  private readonly maxRetries = 3;
  private readonly updateThrottleMs = 2000; // ✅ 修复: 改为 2 秒节流
  private readonly maxContentLength = 500000; // 500KB 内容长度限制
  private currentPageId: number | null = null; // 当前处理的页面 ID

  async run(): Promise<void> {
    this.isRunning = true;
    console.log(`[Converter-${this.workerId}] Started`);

    while (this.isRunning) {
      try {
        const page = await this.claimPage();

        if (!page) {
          await this.sleep(WORKER_CONFIG.converter.pollInterval);
          continue;
        }

        this.currentPageId = page.id;
        console.log(`[Converter-${this.workerId}] Claimed page ${page.page} of task ${page.task}`);

        await this.processPageWithRetry(page);

        this.currentPageId = null;

      } catch (error) {
        console.error(`[Converter-${this.workerId}] Unexpected error:`, error);
        this.currentPageId = null;
        await this.sleep(WORKER_CONFIG.converter.pollInterval);
      }
    }

    console.log(`[Converter-${this.workerId}] Stopped`);
  }

  /**
   * 优雅停止 Worker（释放当前持有的页面）
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // 释放当前正在处理的页面
    if (this.currentPageId) {
      try {
        await prisma.taskDetail.updateMany({
          where: {
            id: this.currentPageId,
            worker_id: this.workerId,
            status: PageStatus.PROCESSING,
          },
          data: {
            status: PageStatus.PENDING,
            worker_id: null,
            started_at: null,
          },
        });
        console.log(`[Converter-${this.workerId}] Released page ${this.currentPageId} on stop`);
      } catch (error) {
        console.error(`[Converter-${this.workerId}] Failed to release page on stop:`, error);
      }
    }
  }

  // 其他方法见下文...
}
```

### 3.2 页面抢占（claimPage）

**设计要点**:
- ✅ **使用 Prisma 乐观锁**（SQLite 不支持 `FOR UPDATE SKIP LOCKED`）
- ✅ **过滤已取消任务**（避免处理僵尸页面）
- 优先处理重试次数少的页面（公平性）
- 按页码顺序处理（提高缓存命中率）
- 同时支持 PENDING 和 RETRYING 状态

> ⚠️ **并发安全说明**: 使用 `findFirst` + `updateMany` 乐观锁模式，通过多重条件检查（状态、worker_id）避免竞态。被其他 Worker 抢占的页面会导致 `updateResult.count = 0`，触发重试。

```typescript
/**
 * ✅ 修复版：抢占待处理的页面（乐观锁，兼容 SQLite）
 */
private async claimPage(): Promise<TaskDetail | null> {
  const MAX_CLAIM_ATTEMPTS = 3;

  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    // 1. 查找待处理页面（排除已取消任务）
    const page = await prisma.taskDetail.findFirst({
      where: {
        task: {
          status: TaskStatus.PROCESSING, // ✅ 修复: 只处理 PROCESSING 任务
          // ✅ 新增: 排除 CANCELLED 任务（避免僵尸页面）
          NOT: { status: TaskStatus.CANCELLED }
        },
        status: { in: [PageStatus.PENDING, PageStatus.RETRYING] },
        worker_id: null, // 确保未被占用
      },
      orderBy: [
        { retry_count: 'asc' }, // 优先处理重试次数少的
        { page: 'asc' },        // 按页码顺序
      ],
    });

    if (!page) return null;

    // 2. 使用 updateMany + where 条件实现乐观锁
    const updateResult = await prisma.taskDetail.updateMany({
      where: {
        id: page.id,
        status: { in: [PageStatus.PENDING, PageStatus.RETRYING] }, // 再次检查状态
        worker_id: null, // 确保未被其他 Worker 抢占
      },
      data: {
        status: PageStatus.PROCESSING,
        worker_id: this.workerId,
        started_at: new Date(),
        updatedAt: new Date(),
      },
    });

    if (updateResult.count > 0) {
      // 3. 抢占成功，获取完整记录
      return await prisma.taskDetail.findUnique({ where: { id: page.id } });
    }

    // 4. 抢占失败（被其他 Worker 抢走），短暂随机延迟后重试
    await this.sleep(Math.random() * 100);
  }

  console.log(`[Converter-${this.workerId}] Failed to claim page after ${MAX_CLAIM_ATTEMPTS} attempts`);
  return null;
}
```

**⚠️ 重要变更说明**:
1. **移除原生 SQL**: SQLite 不支持 `FOR UPDATE SKIP LOCKED`，统一使用 Prisma API
2. **新增任务取消检查**: 在 `where` 条件中排除 `CANCELLED` 任务，避免循环处理
3. **简化实现**: 删除 78 行死代码（`claimPageWithOptimisticLock` 备用方案）

### 3.3 Worker 内部 3 次自动重试

**重试策略**:
- 指数退避延迟：1s → 2s → 4s
- 每次重试尝试都记录到数据库（支持崩溃恢复）
- 失败后标记页面为 FAILED
- 用户可手动触发单页重试
- 某些错误类型（如配置错误）不重试

```typescript
/**
 * ✅ 修复版：带重试的页面处理
 */
private async processPageWithRetry(page: TaskDetail): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < this.maxRetries; attempt++) {
    try {
      // ✅ 修复: 每次尝试前增加计数（支持崩溃恢复）
      if (attempt > 0) {
        // 检查上次错误是否可重试
        if (lastError && !this.isRetryableError(lastError)) {
          console.log(`[Converter-${this.workerId}] Error not retryable, failing immediately`);
          break;
        }

        // 增加重试计数并延迟
        await this.incrementRetryCount(page.id);
        const delay = this.calculateRetryDelay(attempt - 1, lastError!);
        console.log(`[Converter-${this.workerId}] Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }

      // 执行转换（带超时控制）
      const result = await this.convertPageWithTimeout(page);

      // 成功完成
      await this.completePageSuccess(page, result);

      console.log(
        `[Converter-${this.workerId}] Page ${page.page} completed` +
        (attempt > 0 ? ` (after ${attempt} retries)` : '')
      );

      return; // 成功完成，退出重试循环

    } catch (error) {
      lastError = error as Error;

      console.warn(
        `[Converter-${this.workerId}] Page ${page.page} attempt ${attempt + 1}/${this.maxRetries} failed:`,
        {
          errorType: this.analyzeError(lastError),
          isRetryable: this.isRetryableError(lastError),
          message: lastError.message,
        }
      );

      // 如果是最后一次尝试或错误不可重试，直接失败
      if (attempt === this.maxRetries - 1 || !this.isRetryableError(lastError)) {
        break;
      }
    }
  }

  // 所有重试都失败
  console.error(
    `[Converter-${this.workerId}] Page ${page.page} failed after ${this.maxRetries} attempts`
  );
  await this.completePageFailed(page, lastError!);
}

/**
 * 增加重试计数（每次尝试都记录，支持崩溃恢复）
 */
private async incrementRetryCount(pageId: number): Promise<void> {
  await prisma.taskDetail.updateMany({
    where: {
      id: pageId,
      worker_id: this.workerId, // 幂等性检查
    },
    data: {
      retry_count: { increment: 1 },
      updatedAt: new Date(),
    },
  });
}

/**
 * 计算重试延迟（带随机抖动避免雷鸣群体效应）
 */
private calculateRetryDelay(attempt: number, error: Error): number {
  const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s

  // 对于 rate limit 错误，使用更长的延迟
  const errorType = this.analyzeError(error);
  const multiplier = errorType === ErrorType.RATE_LIMIT_ERROR ? 3 : 1;

  // 添加随机抖动 (±20%)
  const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);

  return Math.round(baseDelay * multiplier + jitter);
}
```

### 3.4 LLM 转换（convertPage）

**核心流程**:
1. 读取图片文件（通过 ImagePathUtil）
2. 构造消息（使用 Model.transformImageMessage）
3. 调用 LLM API（支持流式响应 + 超时控制）
4. 提取 token 使用信息
5. 清理 Markdown 内容

```typescript
/**
 * 调用 LLM 转换页面为 Markdown（带超时控制）
 */
private async convertPageWithTimeout(page: TaskDetail): Promise<{
  markdown: string;
  inputTokens: number;
  outputTokens: number;
  conversionTime: number;
}> {
  const timeout = WORKER_CONFIG.converter.timeout || 120000;

  return Promise.race([
    this.convertPage(page),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM conversion timeout')), timeout)
    ),
  ]);
}

/**
 * 调用 LLM 转换页面为 Markdown
 */
private async convertPage(page: TaskDetail): Promise<{
  markdown: string;
  inputTokens: number;
  outputTokens: number;
  conversionTime: number;
}> {
  const startTime = Date.now();

  // 1. 获取图片路径
  const imagePath = ImagePathUtil.getPath(page.task, page.page);

  // 2. 构造消息（包含 system prompt 和 image content）
  const messages = await modelLogic.transformImageMessage(imagePath);

  // 3. 流式响应处理（带幂等性检查和内容长度限制）
  let accumulatedContent = '';
  let lastUpdateTime = Date.now();

  const result = await modelLogic.completion(page.provider, {
    model: page.model,
    messages,
    stream: true,
    onUpdate: (content: string) => {
      // 内容长度限制（防止内存问题）
      if (content.length > this.maxContentLength) {
        accumulatedContent = content.substring(0, this.maxContentLength);
        console.warn(`[Converter-${this.workerId}] Content truncated at ${this.maxContentLength} chars`);
        return;
      }

      accumulatedContent = content;

      // 节流更新：每 500ms 最多更新一次
      const now = Date.now();
      if (now - lastUpdateTime > this.updateThrottleMs) {
        this.updatePageProgressSafe(page.id, content).catch(err => {
          console.warn(`[Converter-${this.workerId}] Failed to update progress:`, err);
        });
        lastUpdateTime = now;
      }
    },
  });

  const conversionTime = Date.now() - startTime;

  // 4. 提取 token 信息（✅ 修复: 通过 rawResponse 适配多供应商）
  const inputTokens = this.extractInputTokens(result);
  const outputTokens = this.extractOutputTokens(result);

  // 5. ✅ 新增: 验证内容有效性
  if (!result.content || result.content.trim().length === 0) {
    throw new Error('LLM returned empty content');
  }

  // 6. 清理 Markdown 内容
  const markdown = this.cleanMarkdownContent(result.content);

  // 7. 释放内存
  accumulatedContent = '';

  return { markdown, inputTokens, outputTokens, conversionTime };
}

/**
 * 安全的节流更新页面进度（带幂等性检查）
 */
private async updatePageProgressSafe(pageId: number, content: string): Promise<void> {
  // 使用 updateMany + where 条件确保幂等性
  await prisma.taskDetail.updateMany({
    where: {
      id: pageId,
      worker_id: this.workerId, // 确保仍是当前 Worker 持有
      status: PageStatus.PROCESSING, // 确保状态未变
    },
    data: {
      content,
      updatedAt: new Date(),
    },
  });
}

/**
 * ✅ 修复版：提取输入 token 数（适配多供应商）
 */
private extractInputTokens(result: any): number {
  const usage = result.rawResponse?.usage;
  if (!usage) return 0;

  // OpenAI / Azure OpenAI
  if (usage.prompt_tokens !== undefined) return usage.prompt_tokens;

  // Anthropic / Claude
  if (usage.input_tokens !== undefined) return usage.input_tokens;

  // Gemini (嵌套结构)
  if (result.rawResponse?.usageMetadata?.promptTokenCount !== undefined) {
    return result.rawResponse.usageMetadata.promptTokenCount;
  }

  // Ollama
  if (usage.prompt_eval_count !== undefined) return usage.prompt_eval_count;

  return 0;
}

/**
 * ✅ 修复版：提取输出 token 数（适配多供应商）
 */
private extractOutputTokens(result: any): number {
  const usage = result.rawResponse?.usage;
  if (!usage) return 0;

  // OpenAI / Azure OpenAI
  if (usage.completion_tokens !== undefined) return usage.completion_tokens;

  // Anthropic / Claude
  if (usage.output_tokens !== undefined) return usage.output_tokens;

  // Gemini (嵌套结构)
  if (result.rawResponse?.usageMetadata?.candidatesTokenCount !== undefined) {
    return result.rawResponse.usageMetadata.candidatesTokenCount;
  }

  // Ollama
  if (usage.eval_count !== undefined) return usage.eval_count;

  return 0;
}

/**
 * 清理 Markdown 内容
 */
private cleanMarkdownContent(content: string): string {
  // 移除首尾空白
  content = content.trim();

  // 移除可能的 markdown 代码块标记
  content = content.replace(/^```markdown\n?/i, '');
  content = content.replace(/\n?```$/i, '');

  return content;
}
```

### 3.5 幂等性保证

**三重检查机制**:
1. Worker ID 匹配检查
2. 页面状态检查（必须是 PROCESSING）
3. 任务取消检查

```typescript
/**
 * ✅ 修复版：完成页面（成功）- 带事务冲突重试
 */
private async completePageSuccess(
  page: TaskDetail,
  result: {
    markdown: string;
    inputTokens: number;
    outputTokens: number;
    conversionTime: number;
  }
): Promise<void> {
  const MAX_TX_RETRIES = 3;

  for (let txAttempt = 0; txAttempt < MAX_TX_RETRIES; txAttempt++) {
    try {
      await this.completePageSuccessTransaction(page, result);
      return; // 成功完成
    } catch (error: any) {
      // ✅ 新增: 检测 Prisma 事务冲突错误
      const isPrismaConflict = error.code === 'P2034' || error.message?.includes('transaction');

      if (isPrismaConflict && txAttempt < MAX_TX_RETRIES - 1) {
        console.warn(
          `[Converter-${this.workerId}] Transaction conflict on page ${page.id}, retrying (${txAttempt + 1}/${MAX_TX_RETRIES})...`
        );
        await this.sleep(Math.random() * 200 + 100); // 100-300ms 随机延迟
        continue;
      }

      // 非冲突错误或重试耗尽，抛出
      throw error;
    }
  }
}

/**
 * 事务内部逻辑（供重试使用）
 */
private async completePageSuccessTransaction(
  page: TaskDetail,
  result: {
    markdown: string;
    inputTokens: number;
    outputTokens: number;
    conversionTime: number;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 幂等性检查：确认当前 Worker 仍持有该页面
    const currentPage = await tx.taskDetail.findUnique({
      where: { id: page.id },
    });

    if (
      !currentPage ||
      currentPage.worker_id !== this.workerId ||
      currentPage.status !== PageStatus.PROCESSING
    ) {
      console.log(`[Converter-${this.workerId}] Page ${page.id} already processed, skipping`);
      return; // 其他 Worker 已处理，跳过
    }

    // 2. 检查任务是否已取消
    const task = await tx.task.findUnique({
      where: { id: page.task },
    });

    if (!task || task.status === TaskStatus.CANCELLED) {
      console.log(`[Converter-${this.workerId}] Task ${page.task} cancelled, discarding result`);
      return; // 任务已取消，丢弃结果
    }

    // 3. 更新页面状态和内容
    await tx.taskDetail.update({
      where: { id: page.id },
      data: {
        status: PageStatus.COMPLETED,
        content: result.markdown,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        conversion_time: result.conversionTime,
        completed_at: new Date(),
        worker_id: null, // 释放占用
        error: null,
        updatedAt: new Date(),
      },
    });

    // 4. 原子增加完成计数器并获取更新后的任务状态
    const updatedTask = await tx.task.update({
      where: { id: page.task },
      data: {
        completed_count: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // 5. 检测任务是否完成（利用行锁避免竞态）
    const finishedCount = updatedTask.completed_count + updatedTask.failed_count;
    // ✅ 修复: 只使用完成进度（移除未使用的 successProgress）
    const completionProgress = Math.floor((finishedCount / updatedTask.pages) * 100);

    if (finishedCount === updatedTask.pages) {
      // 所有页面处理完毕
      if (updatedTask.completed_count === updatedTask.pages) {
        // 全部成功 → READY_TO_MERGE
        await tx.task.update({
          where: { id: page.task },
          data: {
            status: TaskStatus.READY_TO_MERGE,
            progress: completionProgress,
          },
        });
        console.log(`[Converter-${this.workerId}] Task ${page.task}: PROCESSING → READY_TO_MERGE`);
      } else {
        // 有失败 → PARTIAL_FAILED
        await tx.task.update({
          where: { id: page.task },
          data: {
            status: TaskStatus.PARTIAL_FAILED,
            progress: completionProgress,
          },
        });
        console.log(`[Converter-${this.workerId}] Task ${page.task}: PROCESSING → PARTIAL_FAILED`);
      }
    } else {
      // 未完成，更新进度（使用完成进度）
      await tx.task.update({
        where: { id: page.task },
        data: { progress: completionProgress },
      });
    }
  }, {
    // 使用可序列化隔离级别确保并发安全
    isolationLevel: 'Serializable',
  });

  // 发射事件通知前端（在事务外，避免阻塞）
  eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, {
    taskId: page.task,
    timestamp: Date.now(),
  });
}

/**
 * ✅ 修复版：完成页面（失败）- 带事务冲突重试
 */
private async completePageFailed(page: TaskDetail, error: Error): Promise<void> {
  const MAX_TX_RETRIES = 3;

  for (let txAttempt = 0; txAttempt < MAX_TX_RETRIES; txAttempt++) {
    try {
      await this.completePageFailedTransaction(page, error);
      return;
    } catch (txError: any) {
      const isPrismaConflict = txError.code === 'P2034' || txError.message?.includes('transaction');

      if (isPrismaConflict && txAttempt < MAX_TX_RETRIES - 1) {
        console.warn(
          `[Converter-${this.workerId}] Transaction conflict on failed page ${page.id}, retrying...`
        );
        await this.sleep(Math.random() * 200 + 100);
        continue;
      }

      throw txError;
    }
  }
}

private async completePageFailedTransaction(page: TaskDetail, error: Error): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 幂等性检查
    const currentPage = await tx.taskDetail.findUnique({
      where: { id: page.id },
    });

    if (
      !currentPage ||
      currentPage.worker_id !== this.workerId ||
      currentPage.status !== PageStatus.PROCESSING
    ) {
      console.log(`[Converter-${this.workerId}] Page ${page.id} already processed, skipping`);
      return;
    }

    // 2. 检查任务是否已取消
    const task = await tx.task.findUnique({
      where: { id: page.task },
    });

    if (!task || task.status === TaskStatus.CANCELLED) {
      console.log(`[Converter-${this.workerId}] Task ${page.task} cancelled, discarding result`);
      return;
    }

    // 3. 更新页面状态（注意：retry_count 已在每次重试时增加）
    await tx.taskDetail.update({
      where: { id: page.id },
      data: {
        status: PageStatus.FAILED,
        error: this.formatError(error),
        worker_id: null,
        updatedAt: new Date(),
      },
    });

    // 4. 原子增加失败计数器
    const updatedTask = await tx.task.update({
      where: { id: page.task },
      data: {
        failed_count: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // 5. 检测任务是否完成
    const finishedCount = updatedTask.completed_count + updatedTask.failed_count;
    const completionProgress = Math.floor((finishedCount / updatedTask.pages) * 100);

    if (finishedCount === updatedTask.pages) {
      // 所有页面处理完毕（肯定有失败）→ PARTIAL_FAILED
      await tx.task.update({
        where: { id: page.task },
        data: {
          status: TaskStatus.PARTIAL_FAILED,
          progress: completionProgress,
        },
      });
      console.log(`[Converter-${this.workerId}] Task ${page.task}: PROCESSING → PARTIAL_FAILED`);
    } else {
      // 未完成，更新进度
      await tx.task.update({
        where: { id: page.task },
        data: { progress: completionProgress },
      });
    }
  }, {
    isolationLevel: 'Serializable',
  });

  // 发射事件通知前端
  eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, {
    taskId: page.task,
    timestamp: Date.now(),
  });
}

/**
 * 格式化错误信息（截断过长的消息）
 */
private formatError(error: Error): string {
  let message = error.message;

  // 截断过长的错误信息（数据库字段限制）
  if (message.length > 500) {
    message = message.substring(0, 497) + '...';
  }

  return message;
}
```

### 3.6 任务完成检测机制

**关键原理**（参考 `TASK_STATE_DESIGN.md` 5.2 节）:

```
UPDATE task SET completed_count = completed_count + 1 WHERE id = ?
```

这条 SQL 会：
1. 获取行锁（Row Lock）
2. 并发的 Worker 会排队执行
3. 只有一个 Worker 会看到 `finishedCount === pages`
4. 在事务中原子地转换任务状态

**状态转换逻辑**:
- `completed_count === pages` → `READY_TO_MERGE`（全部成功）
- `failed_count > 0 && finishedCount === pages` → `PARTIAL_FAILED`（部分失败）

**进度计算说明**:
- `completionProgress`: 已处理页面 / 总页面（表示任务完成度）
- `successProgress`: 成功页面 / 总页面（表示转换成功率）

---

## 4. 流式响应机制

### 4.1 架构图

```
┌──────────────┐   Stream    ┌──────────────┐   Throttle   ┌──────────────┐
│  LLM API     │──────────────▶│ onUpdate     │──────────────▶│  Database    │
│              │   (chunk)    │  Callback    │   (500ms)    │  (content)   │
└──────────────┘              └──────────────┘              └──────────────┘
                                      │
                                      │ Event
                                      ▼
                              ┌──────────────┐
                              │  EventBus    │
                              │              │
                              └──────┬───────┘
                                     │
                                     │ IPC
                                     ▼
                              ┌──────────────┐
                              │  Frontend    │
                              └──────────────┘
```

### 4.2 节流更新实现

在 `convertPage` 方法中：

```typescript
let lastUpdateTime = Date.now();

onUpdate: (content: string) => {
  // 内容长度限制
  if (content.length > this.maxContentLength) {
    accumulatedContent = content.substring(0, this.maxContentLength);
    return;
  }

  accumulatedContent = content;

  // 节流更新：每 500ms 最多更新一次
  const now = Date.now();
  if (now - lastUpdateTime > this.updateThrottleMs) {
    // 使用带幂等性检查的更新方法
    this.updatePageProgressSafe(page.id, content).catch(err => {
      console.warn('Failed to update progress:', err);
    });
    lastUpdateTime = now;
  }
}
```

**优点**:
- 减少数据库写入次数
- 避免频繁的事务开销
- 前端仍能获得流畅的实时更新体验
- 幂等性检查避免覆盖其他 Worker 的数据
- 内容长度限制防止内存溢出

### 4.3 EventBus 集成

在 `completePageSuccess` 和 `completePageFailed` 中发射事件：

```typescript
eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, {
  taskId: page.task,
  timestamp: Date.now(),
});
```

前端通过现有的 `eventBridge.ts` 接收：

```typescript
// src/main/ipc/eventBridge.ts (已存在)
eventBus.onTaskEvent('task:*', (data) => {
  mainWindow.webContents.send('task:event', data);
});
```

---

## 5. 错误处理和重试

### 5.1 错误分类

```typescript
enum ErrorType {
  NETWORK_ERROR = 'network_error',      // 网络错误（可重试）
  LLM_ERROR = 'llm_error',              // LLM API 错误（可重试）
  RATE_LIMIT_ERROR = 'rate_limit_error', // 速率限制（可重试，延迟更长）
  QUOTA_EXCEEDED_ERROR = 'quota_exceeded_error', // 配额超限（不可重试）
  CONFIG_ERROR = 'config_error',        // 配置错误（不可重试）
  FILE_ERROR = 'file_error',            // 文件错误（不可重试）
  TIMEOUT_ERROR = 'timeout_error',      // 超时错误（可重试）
  UNKNOWN_ERROR = 'unknown_error',      // 未知错误（可重试）
}

/**
 * 分析错误类型
 */
private analyzeError(error: Error): ErrorType {
  const message = error.message.toLowerCase();

  if (message.includes('network') || message.includes('econnrefused') || message.includes('econnreset')) {
    return ErrorType.NETWORK_ERROR;
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return ErrorType.TIMEOUT_ERROR;
  }

  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
    return ErrorType.RATE_LIMIT_ERROR;
  }

  if (message.includes('quota') || message.includes('insufficient') || message.includes('billing')) {
    return ErrorType.QUOTA_EXCEEDED_ERROR;
  }

  if (message.includes('api key') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
    return ErrorType.CONFIG_ERROR;
  }

  if (message.includes('enoent') || message.includes('no such file') || message.includes('not found')) {
    return ErrorType.FILE_ERROR;
  }

  if (message.includes('api') || message.includes('500') || message.includes('502') || message.includes('503')) {
    return ErrorType.LLM_ERROR;
  }

  return ErrorType.UNKNOWN_ERROR;
}

/**
 * 判断错误是否可重试
 */
private isRetryableError(error: Error): boolean {
  const errorType = this.analyzeError(error);

  // 不可重试的错误类型
  const nonRetryableTypes = [
    ErrorType.CONFIG_ERROR,       // API Key 错误不重试
    ErrorType.FILE_ERROR,         // 文件不存在不重试
    ErrorType.QUOTA_EXCEEDED_ERROR, // 配额超限不重试
  ];

  return !nonRetryableTypes.includes(errorType);
}
```

### 5.2 重试延迟策略

**指数退避 + 随机抖动**:
```typescript
private calculateRetryDelay(attempt: number, error: Error): number {
  const baseDelay = Math.pow(2, attempt) * 1000;
  // attempt 0: 1000ms (1s)
  // attempt 1: 2000ms (2s)
  // attempt 2: 4000ms (4s)

  // 对于 rate limit 错误，使用更长的延迟
  const errorType = this.analyzeError(error);
  const multiplier = errorType === ErrorType.RATE_LIMIT_ERROR ? 3 : 1;

  // 添加随机抖动 (±20%) 避免雷鸣群体效应
  const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);

  return Math.round(baseDelay * multiplier + jitter);
}
```

### 5.3 详细错误日志

在每次重试和最终失败时记录：

```typescript
console.warn(
  `[Converter-${this.workerId}] Page ${page.page} attempt ${attempt + 1}/${this.maxRetries} failed:`,
  {
    errorType: this.analyzeError(error),
    isRetryable: this.isRetryableError(error),
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 3).join('\n'),
  }
);
```

---

## 6. 性能优化

### 6.1 并发控制

在 `TaskOrchestrator` 中配置：

```typescript
// src/server/config/worker.config.ts
export const WORKER_CONFIG = {
  converter: {
    count: 3,              // 默认 3 个 Worker 实例
    pollInterval: 2000,    // 轮询间隔 2 秒
    timeout: 120000,       // 超时 2 分钟
    maxRetries: 3,         // 最大重试次数
    retryDelayBase: 1000,  // 重试延迟基数（毫秒）
    updateThrottleMs: 2000, // ✅ 修复: 流式更新节流改为 2 秒
    maxContentLength: 500000, // 最大内容长度（字节）
  },
};
```

**调优建议**:
- CPU 密集型任务：`count = CPU 核心数`
- I/O 密集型任务：`count = CPU 核心数 * 2`
- 当前场景（LLM API 调用）：建议 `count = 3-5`

### 6.2 数据库查询优化

现有索引（已在 `schema.prisma` 中定义）:
```prisma
@@index([task, status])  // 用于 claimPage 查询
@@index([task, page])    // 用于按页码排序
```

**建议复合索引**（优化 claimPage 查询）:
```prisma
@@index([status, retry_count, page])  // 优化抢占排序
@@index([worker_id, status])          // 优化幂等性检查
```

### 6.3 内存管理

- 使用累积变量而非数组存储流式内容
- 节流写入数据库
- 设置内容长度限制
- 完成后立即释放引用

```typescript
let accumulatedContent = ''; // 累积变量

// 内容长度限制
if (content.length > this.maxContentLength) {
  accumulatedContent = content.substring(0, this.maxContentLength);
  return;
}

// ... 处理完成后 ...
accumulatedContent = ''; // 释放内存
```

### 6.4 事务隔离级别

使用 `Serializable` 隔离级别确保并发安全：

```typescript
await prisma.$transaction(async (tx) => {
  // ... 事务内容 ...
}, {
  isolationLevel: 'Serializable',
});
```

---

## 7. 集成点

### 7.1 集成到 TaskOrchestrator

**文件**: `src/server/logic/Task.ts` 或 `src/server/workers/TaskOrchestrator.ts`

```typescript
import { ConverterWorker } from './workers/ConverterWorker.js';
import { WORKER_CONFIG } from './config/worker.config.js';

export class TaskOrchestrator {
  private splitter: SplitterWorker;
  private converters: ConverterWorker[];
  private merger: MergerWorker;  // 未来实现

  constructor() {
    this.splitter = new SplitterWorker();

    // 创建多个 ConverterWorker 实例
    const count = WORKER_CONFIG.converter.count;
    this.converters = Array.from(
      { length: count },
      () => new ConverterWorker()
    );

    // this.merger = new MergerWorker();  // 未来实现
  }

  async start(): Promise<void> {
    console.log('[Orchestrator] Starting all workers...');

    // 启动所有 workers（并行，不阻塞）
    this.splitter.run().catch(err =>
      console.error('[Orchestrator] Splitter error:', err)
    );

    this.converters.forEach((converter, index) => {
      converter.run().catch(err =>
        console.error(`[Orchestrator] Converter-${index} error:`, err)
      );
    });

    console.log('[Orchestrator] All workers started');
  }

  async stop(): Promise<void> {
    console.log('[Orchestrator] Stopping all workers...');

    // 优雅停止所有 workers（使用 Promise.all 等待完成）
    await Promise.all([
      this.splitter.stop(),
      ...this.converters.map(c => c.stop()),
    ]);

    console.log('[Orchestrator] All workers stopped');
  }
}
```

### 7.2 IPC Handlers

需要添加的 Handler：

**文件**: `src/main/ipc/handlers.ts`

#### 7.2.1 单页重试

```typescript
ipcMain.handle('taskDetail:retry', async (_, pageId: number) => {
  try {
    await prisma.$transaction(async (tx) => {
      const page = await tx.taskDetail.findUnique({ where: { id: pageId } });

      if (!page) throw new Error('Page not found');

      const wasCompleted = page.status === PageStatus.COMPLETED;
      const wasFailed = page.status === PageStatus.FAILED;

      if (!wasCompleted && !wasFailed) {
        throw new Error('Can only retry COMPLETED or FAILED pages');
      }

      // 检查任务状态（不允许重试已取消/已完成的任务）
      const task = await tx.task.findUnique({ where: { id: page.task } });
      if (!task) {
        throw new Error('Task not found');
      }
      if (task.status === TaskStatus.CANCELLED) {
        throw new Error('Cannot retry pages of a cancelled task');
      }
      if (task.status === TaskStatus.COMPLETED) {
        throw new Error('Cannot retry pages of a completed task');
      }

      // 更新页面为 RETRYING
      await tx.taskDetail.update({
        where: { id: pageId },
        data: {
          status: PageStatus.RETRYING,
          error: null,
          worker_id: null,
        },
      });

      // 更新任务状态和计数器
      const updateData: any = { status: TaskStatus.PROCESSING };
      if (wasCompleted) {
        updateData.completed_count = { decrement: 1 };
      } else {
        updateData.failed_count = { decrement: 1 };
      }

      await tx.task.update({
        where: { id: page.task },
        data: updateData,
      });
    }, {
      isolationLevel: 'Serializable',
    });

    return { success: true };
  } catch (error: any) {
    console.error('[IPC] taskDetail:retry error:', error);
    return { success: false, error: error.message };
  }
});
```

#### 7.2.2 批量重试失败页面

```typescript
ipcMain.handle('taskDetail:retryFailed', async (_, taskId: string) => {
  try {
    await prisma.$transaction(async (tx) => {
      // 检查任务状态
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) {
        throw new Error('Task not found');
      }
      if (task.status === TaskStatus.CANCELLED) {
        throw new Error('Cannot retry pages of a cancelled task');
      }
      if (task.status === TaskStatus.COMPLETED) {
        throw new Error('Cannot retry pages of a completed task');
      }

      // 找到所有失败的页面
      const failedPages = await tx.taskDetail.findMany({
        where: { task: taskId, status: PageStatus.FAILED },
      });

      if (failedPages.length === 0) {
        throw new Error('No failed pages to retry');
      }

      // 更新所有失败页面为 RETRYING
      await tx.taskDetail.updateMany({
        where: { task: taskId, status: PageStatus.FAILED },
        data: {
          status: PageStatus.RETRYING,
          error: null,
          worker_id: null,
        },
      });

      // 更新任务状态
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.PROCESSING,
          failed_count: { decrement: failedPages.length },
        },
      });
    }, {
      isolationLevel: 'Serializable',
    });

    return { success: true };
  } catch (error: any) {
    console.error('[IPC] taskDetail:retryFailed error:', error);
    return { success: false, error: error.message };
  }
});
```

#### 7.2.3 查看成本统计

```typescript
ipcMain.handle('taskDetail:getCostStats', async (_, taskId: string) => {
  try {
    const stats = await prisma.taskDetail.aggregate({
      where: { task: taskId },
      _sum: {
        input_tokens: true,
        output_tokens: true,
        conversion_time: true,
      },
      _avg: {
        conversion_time: true,
      },
      _count: true,
    });

    // 获取成功/失败统计
    const statusStats = await prisma.taskDetail.groupBy({
      by: ['status'],
      where: { task: taskId },
      _count: true,
    });

    return {
      success: true,
      data: {
        totalInputTokens: stats._sum.input_tokens || 0,
        totalOutputTokens: stats._sum.output_tokens || 0,
        totalTokens: (stats._sum.input_tokens || 0) + (stats._sum.output_tokens || 0),
        totalTime: stats._sum.conversion_time || 0,
        avgTime: Math.round(stats._avg.conversion_time || 0),
        pageCount: stats._count,
        statusBreakdown: statusStats.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
      },
    };
  } catch (error: any) {
    console.error('[IPC] taskDetail:getCostStats error:', error);
    return { success: false, error: error.message };
  }
});
```

---

## 8. 测试策略

### 8.1 单元测试

**文件**: `src/server/workers/__tests__/ConverterWorker.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConverterWorker } from '../ConverterWorker';
import { prisma } from '../../db';
import { PageStatus, TaskStatus } from '../../types';

describe('ConverterWorker', () => {
  let worker: ConverterWorker;

  beforeEach(() => {
    worker = new ConverterWorker();
  });

  describe('claimPage', () => {
    it('should claim a PENDING page atomically', async () => {
      // 创建测试任务和页面
      const task = await prisma.task.create({
        data: { /* ... */ status: TaskStatus.PROCESSING },
      });
      const page = await prisma.taskDetail.create({
        data: { task: task.id, status: PageStatus.PENDING },
      });

      // 抢占页面
      const claimed = await worker['claimPage']();

      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe(PageStatus.PROCESSING);
      expect(claimed!.worker_id).toBe(worker.getWorkerId());
    });

    it('should not claim the same page twice (concurrent safety)', async () => {
      // 创建多个 Worker 并发抢占同一页面
      const workers = [new ConverterWorker(), new ConverterWorker(), new ConverterWorker()];

      // 并发抢占
      const results = await Promise.all(workers.map(w => w['claimPage']()));

      // 只有一个 Worker 应该成功
      const successCount = results.filter(r => r !== null).length;
      expect(successCount).toBe(1);
    });

    it('should prioritize pages with lower retry_count', async () => {
      // 创建两个页面，retry_count 不同
      // 验证抢占顺序
    });
  });

  describe('processPageWithRetry', () => {
    it('should retry on transient errors', async () => {
      // Mock LLM 调用失败 2 次，第 3 次成功
      // 验证重试逻辑
    });

    it('should fail after max retries', async () => {
      // Mock LLM 调用持续失败
      // 验证最终标记为 FAILED
    });

    it('should not retry on non-retryable errors', async () => {
      // Mock 配置错误（API Key 无效）
      // 验证立即失败，不重试
    });

    it('should increment retry_count on each attempt', async () => {
      // 验证每次重试都更新 retry_count
    });
  });

  describe('completePageSuccess', () => {
    it('should update page and task atomically', async () => {
      // 验证事务原子性
    });

    it('should detect task completion', async () => {
      // 创建只有 1 页的任务
      // 验证完成后状态转为 READY_TO_MERGE
    });

    it('should handle concurrent updates (idempotency)', async () => {
      // 并发调用 completePageSuccess
      // 验证只有一个成功
    });
  });

  describe('stop', () => {
    it('should release current page on graceful stop', async () => {
      // 验证优雅停止时释放页面
    });
  });
});
```

### 8.2 集成测试

**文件**: `src/server/__tests__/integration/converter.test.ts`

```typescript
describe('ConverterWorker Integration', () => {
  it('should complete end-to-end conversion', async () => {
    // 1. 上传 PDF
    // 2. SplitterWorker 拆分
    // 3. ConverterWorker 转换
    // 4. 验证结果
  });

  it('should handle concurrent processing', async () => {
    // 启动多个 ConverterWorker
    // 验证无竞态条件
  });

  it('should recover from crashes', async () => {
    // Worker 崩溃后重启
    // HealthChecker 回退超时页面
    // 新 Worker 继续处理
  });

  it('should handle task cancellation', async () => {
    // 取消正在处理的任务
    // 验证 Worker 丢弃结果
  });

  it('should respect timeout configuration', async () => {
    // 模拟 LLM 响应超时
    // 验证超时后重试
  });
});
```

### 8.3 Mock LLM 响应

**文件**: `src/server/logic/llm/__mocks__/MockLLMClient.ts`

```typescript
export class MockLLMClient extends LLMClient {
  private failCount = 0;
  private maxFails = 0;

  setFailCount(count: number) {
    this.maxFails = count;
    this.failCount = 0;
  }

  async completion(options: CompletionOptions): Promise<CompletionResponse> {
    // 模拟失败
    if (this.failCount < this.maxFails) {
      this.failCount++;
      throw new Error('Mock LLM error');
    }

    // 模拟延迟和流式响应
    if (options.stream && options.onUpdate) {
      const content = '# Mock Markdown\n\nThis is a test page.';
      const chunks = content.split(' ');

      let accumulated = '';
      for (const chunk of chunks) {
        accumulated += chunk + ' ';
        options.onUpdate(accumulated);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return {
      content: '# Mock Markdown\n\nThis is a test page.',
      model: 'mock-model',
      finishReason: 'stop',
      rawResponse: {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      },
    };
  }
}
```

---

## 9. 实施步骤

### Phase 1: 数据库准备 ✅

- [ ] 更新 `schema.prisma`（添加 TaskDetail 新字段）
- [ ] 执行 `npx prisma migrate dev --name add_taskdetail_metrics`
- [ ] 验证迁移成功
- [ ] 更新 TypeScript 类型定义

### Phase 2: 核心 Worker 实现 🔄

- [ ] 创建 `src/server/workers/ConverterWorker.ts`
- [ ] 实现 `claimPage` 方法（使用 FOR UPDATE SKIP LOCKED）
- [ ] 实现 `claimPageWithOptimisticLock` 备用方法
- [ ] 实现 `convertPageWithTimeout` 方法（带超时控制）
- [ ] 实现 `convertPage` 方法（LLM 转换 + 流式响应 + 内容限制）
- [ ] 实现 `processPageWithRetry` 方法（3 次自动重试 + 错误分类）
- [ ] 实现 `completePageSuccess` 方法（成功完成 + 任务检测 + 事务隔离）
- [ ] 实现 `completePageFailed` 方法（失败处理）
- [ ] 实现 `stop` 方法（优雅关闭 + 释放页面）
- [ ] 实现辅助方法（extractTokens、cleanMarkdown、formatError、isRetryableError 等）

### Phase 3: 集成到编排器 🔄

- [ ] 修改 `src/server/logic/Task.ts` 或创建 `TaskOrchestrator.ts`
- [ ] 在启动时创建多个 ConverterWorker 实例
- [ ] 验证 Worker 生命周期管理（start/stop）
- [ ] 实现优雅停止（等待所有 Worker 释放资源）
- [ ] 测试多 Worker 并发处理

### Phase 4: IPC Handlers 🔄

- [ ] 实现 `taskDetail:retry`（单页重试 + 任务状态检查）
- [ ] 实现 `taskDetail:retryFailed`（批量重试失败页面 + 任务状态检查）
- [ ] 实现 `taskDetail:getCostStats`（成本统计 + 状态统计）
- [ ] 更新前端 IPC 类型定义

### Phase 5: 测试 🧪

- [ ] 编写单元测试（ConverterWorker.test.ts）
- [ ] 编写并发安全测试
- [ ] 编写集成测试（端到端测试）
- [ ] 创建 MockLLMClient 用于测试
- [ ] 测试异常恢复场景
- [ ] 测试超时场景

### Phase 6: 文档和优化 📝

- [ ] 创建 `docs/CONVERTER_WORKER_DESIGN.md`（本文档）
- [ ] 添加日志和监控
- [ ] 性能调优（数据库查询、Worker 数量）
- [ ] 代码审查和重构

---

## 附录

### A. 关键文件清单

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/server/workers/ConverterWorker.ts` | ConverterWorker 实现 | 🆕 待创建 |
| `src/server/workers/WorkerBase.ts` | Worker 基类 | ✅ 已存在 |
| `src/server/logic/Model.ts` | LLM 调用逻辑 | ✅ 已存在 |
| `src/server/logic/llm/LLMClient.ts` | LLM 抽象接口 | ✅ 已存在 |
| `src/server/logic/split/ImagePathUtil.ts` | 图片路径工具 | ✅ 已存在 |
| `src/server/db/schema.prisma` | 数据库模型 | 🔄 需修改 |
| `src/server/config/worker.config.ts` | Worker 配置 | ✅ 已存在 |
| `src/server/events/EventBus.ts` | 事件总线 | ✅ 已存在 |
| `src/main/ipc/handlers.ts` | IPC 处理器 | 🔄 需添加 |

### B. 配置参数参考

```typescript
export const WORKER_CONFIG = {
  converter: {
    count: 3,              // Worker 实例数
    pollInterval: 2000,    // 轮询间隔（毫秒）
    timeout: 120000,       // 超时时间（毫秒）
    maxRetries: 3,         // 最大重试次数
    retryDelayBase: 1000,  // 重试延迟基数（毫秒）
    updateThrottleMs: 2000, // ✅ 更新节流（毫秒）- 改为 2 秒
    maxContentLength: 500000, // 最大内容长度（字节）
  },
};
```

### C. 监控指标建议

- Worker 处理速度（页/分钟）
- 平均转换时间
- 平均 token 使用量
- 失败率
- 重试率
- 队列长度（PENDING 页面数）
- 超时率
- 内存使用量

### D. 设计变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-01-23 | 初始设计 |
| v1.1 | 2026-01-23 | 修复设计缺陷（已废弃，存在严重问题）|
| v1.2 | 2026-01-24 | **重大修复**：<br>1. ✅ 移除 FOR UPDATE SKIP LOCKED（SQLite 不支持）→ 使用 Prisma 乐观锁<br>2. ✅ 修复 Model.ts 导出不匹配 → 使用 default import<br>3. ✅ 修复重试计数时机 → 每次尝试前增加计数<br>4. ✅ 修复任务取消检查 → claimPage 过滤 CANCELLED 任务<br>5. ✅ 添加事务冲突重试机制 → 捕获 P2034 错误<br>6. ✅ Token 提取适配多供应商 → 统一在 Model.ts 处理<br>7. ✅ 减少流式更新频率 → 2 秒节流<br>8. ✅ 移除未使用的 successProgress 概念<br>9. ✅ 添加内容验证逻辑<br>10. ✅ 优化错误分类为类型化异常 |

---
