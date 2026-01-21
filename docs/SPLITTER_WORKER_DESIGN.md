# SplitterWorker 实现设计方案

> **版本**: v1.0  
> **创建日期**: 2026-01-21  
> **设计目标**: 基于工厂模式的多文件类型拆分器

---

## 目录

- [1. 架构设计](#1-架构设计)
- [2. PDF 处理库选型](#2-pdf处理库选型)
- [3. 页面范围解析](#3-页面范围解析)
- [4. 工厂模式设计](#4-工厂模式设计)
- [5. 实现细节](#5-实现细节)
- [6. 测试策略](#6-测试策略)
- [7. 集成方案](#7-集成方案)

---

## 1. 架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    SplitterWorker                        │
│  (继承 WorkerBase，负责任务抢占和状态管理)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  SplitterFactory      │
         │  (工厂类)              │
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│  PDFSplitter    │    │  ImageSplitter  │
│  (PDF拆分器)     │    │  (图片处理器)    │
└─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
  PDF → JPEG 图片          直接使用原图片
  (150 DPI)                (跳过拆分)
```

### 1.2 设计原则

1. **工厂模式**: 根据文件类型动态选择合适的拆分器
2. **策略模式**: 不同文件类型使用不同的处理策略
3. **单一职责**: 每个拆分器只负责一种文件类型
4. **可扩展性**: 易于添加新的文件类型支持
5. **错误处理**: 完善的错误处理和回退机制

---

## 2. PDF 处理库选型

### 2.1 候选库对比

| 库名                         | 跨平台 | 轻量级                   | PDF 转图片      | 维护状态 | 推荐度     |
| ---------------------------- | ------ | ------------------------ | --------------- | -------- | ---------- |
| **pdf-to-png-converter**     | ✅     | ✅ (纯 JS，无二进制依赖) | ✅              | 活跃     | ⭐⭐⭐⭐⭐ |
| pdf-poppler                  | ✅     | ⚠️ (内置二进制)          | ✅              | 一般     | ⭐⭐⭐     |
| pdf2pic                      | ✅     | ❌ (依赖 GraphicsMagick) | ✅              | 活跃     | ⭐⭐⭐     |
| pdf-lib                      | ✅     | ✅                       | ❌ (仅操作 PDF) | 活跃     | ⭐⭐       |
| pdfjs-dist                   | ✅     | ❌ (较大)                | ✅              | 活跃     | ⭐⭐⭐     |

### 2.2 推荐方案

**首选**: `pdf-to-png-converter` (npm: `pdf-to-png-converter`)

**优势**:

- ✅ 跨平台支持 (Windows/macOS/Linux/Apple Silicon)
- ✅ 纯 JavaScript 实现，无需二进制依赖
- ✅ Electron 打包友好，无 asar 兼容性问题
- ✅ 支持 viewportScale 控制输出质量
- ✅ 支持指定页面范围 (`pagesToProcess`)
- ✅ 支持密码保护的 PDF
- ✅ 返回页面信息（宽高、内容 Buffer）
- ✅ 活跃维护，最新版本 3.11.0

**要求**: Node.js >= 20

**安装**:

```bash
npm install pdf-to-png-converter
```

**基本用法**:

```typescript
import { pdfToPng } from "pdf-to-png-converter";

// 转换所有页面
const pngPages = await pdfToPng(pdfPath, {
  viewportScale: 2.0, // 2x 缩放，提高清晰度
  outputFolder: outputDir, // 输出目录
  outputFileMaskFunc: (pageNum) => `page-${pageNum}.png`, // 文件名格式
  disableFontFace: false, // 使用内置字体渲染
});

// 返回结果
pngPages.forEach((page) => {
  console.log(`Page ${page.pageNumber}: ${page.path}`);
  // page.pageNumber - 页码 (1-based)
  // page.name - 文件名
  // page.content - PNG Buffer
  // page.path - 文件路径
  // page.width, page.height - 尺寸
});

// 转换指定页面
const selectedPages = await pdfToPng(pdfPath, {
  pagesToProcess: [1, 3, 5], // 只转换第 1, 3, 5 页
  viewportScale: 2.0,
  outputFolder: outputDir,
});
```

---

## 3. 页面范围解析

### 3.1 格式规范

支持的格式:

- `""` 或 `null` → 所有页面
- `"1"` → 单页
- `"1-5"` → 连续范围
- `"1,3,5"` → 多个单页
- `"1-5,7,11-14,23"` → 混合格式

### 3.2 解析器实现

```typescript
/**
 * 页面范围解析器
 */
class PageRangeParser {
  /**
   * 解析页面范围字符串
   * @param rangeStr 页面范围字符串 (e.g., "1-5,7,11-14,23")
   * @param totalPages PDF总页数
   * @returns 页码数组 (1-based)
   */
  static parse(
    rangeStr: string | null | undefined,
    totalPages: number
  ): number[] {
    // 空字符串或null → 所有页面
    if (!rangeStr || rangeStr.trim() === "") {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = new Set<number>();
    const parts = rangeStr.split(",").map((p) => p.trim());

    for (const part of parts) {
      if (part.includes("-")) {
        // 范围格式: "1-5"
        const [start, end] = part.split("-").map((n) => parseInt(n.trim(), 10));

        if (isNaN(start) || isNaN(end)) {
          throw new Error(`Invalid page range: ${part}`);
        }

        if (start < 1 || end > totalPages || start > end) {
          throw new Error(
            `Page range out of bounds: ${part} (total: ${totalPages})`
          );
        }

        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      } else {
        // 单页格式: "7"
        const page = parseInt(part, 10);

        if (isNaN(page)) {
          throw new Error(`Invalid page number: ${part}`);
        }

        if (page < 1 || page > totalPages) {
          throw new Error(
            `Page number out of bounds: ${page} (total: ${totalPages})`
          );
        }

        pages.add(page);
      }
    }

    // 返回排序后的数组
    return Array.from(pages).sort((a, b) => a - b);
  }

  /**
   * 验证页面范围字符串格式
   */
  static validate(rangeStr: string | null | undefined): boolean {
    if (!rangeStr || rangeStr.trim() === "") {
      return true;
    }

    const pattern = /^(\d+(-\d+)?)(,\s*\d+(-\d+)?)*$/;
    return pattern.test(rangeStr.trim());
  }
}
```

### 3.3 测试用例

```typescript
describe("PageRangeParser", () => {
  it("should parse empty string as all pages", () => {
    expect(PageRangeParser.parse("", 10)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("should parse single page", () => {
    expect(PageRangeParser.parse("5", 10)).toEqual([5]);
  });

  it("should parse range", () => {
    expect(PageRangeParser.parse("3-7", 10)).toEqual([3, 4, 5, 6, 7]);
  });

  it("should parse multiple ranges", () => {
    expect(PageRangeParser.parse("1-3,5,8-10", 10)).toEqual([
      1, 2, 3, 5, 8, 9, 10,
    ]);
  });

  it("should throw error for invalid range", () => {
    expect(() => PageRangeParser.parse("5-3", 10)).toThrow();
    expect(() => PageRangeParser.parse("1-20", 10)).toThrow();
  });
});
```

---

## 4. 工厂模式设计

### 4.1 接口定义

```typescript
/**
 * 拆分结果
 */
interface SplitResult {
  pages: PageInfo[];
  totalPages: number;
}

/**
 * 页面信息
 *
 * 文件命名规则：{tempDir}/{taskId}/page-{page}.png
 * - page: 重新编号后的页码（1, 2, 3, ...），用于文件命名和数据库记录
 * - pageSource: 原始 PDF 页码，仅用于显示和调试
 * - imagePath: 图片绝对路径
 *
 * 设计说明：
 * - 数据库 TaskDetail 不存储 image_path，而是根据 taskId + page 动态计算
 * - 这样避免了路径变更时需要更新数据库的问题
 */
interface PageInfo {
  page: number; // 当前页码 (1-based)，重新编号后的序号
  pageSource: number; // 原始PDF页码 (1-based)
  imagePath: string; // 图片绝对路径
}

/**
 * 图片路径工具类
 * 统一管理图片路径的生成规则
 */
class ImagePathUtil {
  private static tempDir: string;

  static init(tempDir: string): void {
    this.tempDir = tempDir;
  }

  /**
   * 根据 taskId 和 page 生成图片路径
   * 格式：{tempDir}/{taskId}/page-{page}.png
   */
  static getPath(taskId: string, page: number): string {
    return path.join(this.tempDir, taskId, `page-${page}.png`);
  }

  /**
   * 获取任务的图片目录
   */
  static getTaskDir(taskId: string): string {
    return path.join(this.tempDir, taskId);
  }
}

/**
 * 拆分器接口
 */
interface ISplitter {
  /**
   * 拆分文件
   * @param task 任务信息
   * @returns 拆分结果
   */
  split(task: Task): Promise<SplitResult>;

  /**
   * 清理临时文件
   * @param taskId 任务ID
   */
  cleanup(taskId: string): Promise<void>;
}
```

### 4.2 数据库设计说明

**关于 `image_path` 字段**：

数据库 `TaskDetail` 表 **不需要** 存储 `image_path` 字段，原因如下：

1. **可计算性**：图片路径可以通过 `taskId + page` 动态计算
2. **一致性**：避免路径变更时数据库和文件系统不一致
3. **简洁性**：减少数据库字段，降低维护成本

```typescript
// ConverterWorker 中获取图片路径
const imagePath = ImagePathUtil.getPath(taskDetail.task, taskDetail.page);
```

如果未来需要支持自定义存储路径，可以在 `Task` 表添加 `storage_type` 字段来扩展。

### 4.3 工厂类

```typescript
/**
 * 拆分器工厂
 */
class SplitterFactory {
  /**
   * 根据文件类型创建拆分器
   */
  static create(fileType: string): ISplitter {
    const type = fileType.toLowerCase();

    switch (type) {
      case "pdf":
        return new PDFSplitter();

      case "jpg":
      case "jpeg":
      case "png":
      case "webp":
        return new ImageSplitter();

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * 从文件名推断文件类型
   */
  static getFileType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) {
      throw new Error(`Cannot determine file type from filename: ${filename}`);
    }
    return ext;
  }
}
```

---

## 5. 实现细节

### 5.1 PDFSplitter

```typescript
import { pdfToPng } from "pdf-to-png-converter";
import path from "path";
import fs from "fs/promises";
import { app } from "electron";

/**
 * PDF拆分器
 *
 * 文件命名规则：{tempDir}/{taskId}/page-{page}.png
 * - page 是重新编号后的页码（1, 2, 3, ...）
 * - 不使用原始 PDF 页码命名，便于后续处理
 */
class PDFSplitter implements ISplitter {
  private readonly uploadDir: string;
  private readonly tempDir: string;
  private readonly VIEWPORT_SCALE = 2.0; // 2x 缩放，清晰度约等于 144 DPI
  private readonly MAX_RETRIES = 3; // 最大重试次数
  private readonly RETRY_DELAY_BASE = 1000; // 重试基础延迟（毫秒）

  constructor() {
    this.uploadDir = path.join(app.getPath("userData"), "uploads");
    this.tempDir = path.join(app.getPath("userData"), "temp");
  }

  async split(task: Task): Promise<SplitResult> {
    const pdfPath = path.join(this.uploadDir, task.filename);
    const outputDir = path.join(this.tempDir, task.id);

    // 1. 创建输出目录
    await fs.mkdir(outputDir, { recursive: true });

    // 2. 解析页面范围（需要先获取总页数，带重试）
    const totalPages = await this.getPDFPageCountWithRetry(pdfPath);
    const pageNumbers = PageRangeParser.parse(task.page_range, totalPages);

    // 3. 转换指定页面为 PNG（带重试）
    const pngPages = await this.convertPagesWithRetry(
      pdfPath,
      outputDir,
      pageNumbers
    );

    // 4. 重命名文件为统一格式：page-{newPage}.png
    const pages: PageInfo[] = [];

    for (let i = 0; i < pngPages.length; i++) {
      const pngPage = pngPages[i];
      const newPage = i + 1; // 重新编号: 1, 2, 3, ...
      const newFileName = `page-${newPage}.png`;
      const newFilePath = path.join(outputDir, newFileName);

      // 重命名文件
      await fs.rename(pngPage.path, newFilePath);

      pages.push({
        page: newPage,
        pageSource: pngPage.pageNumber, // 原始 PDF 页码
        imagePath: newFilePath,
      });
    }

    return {
      pages,
      totalPages: pages.length,
    };
  }

  /**
   * 带重试的 PDF 转换
   */
  private async convertPagesWithRetry(
    pdfPath: string,
    outputDir: string,
    pageNumbers: number[]
  ): Promise<PngPageOutput[]> {
    return this.withRetry(
      async () => {
        return await pdfToPng(pdfPath, {
          viewportScale: this.VIEWPORT_SCALE,
          outputFolder: outputDir,
          outputFileMaskFunc: (pageNum) => `_temp_${pageNum}.png`,
          pagesToProcess: pageNumbers,
          strictPagesToProcess: true,
          disableFontFace: false,
          verbosityLevel: 0,
        });
      },
      "PDF conversion",
      // 密码保护错误不重试
      (error) => !error.message?.includes("password")
    );
  }

  /**
   * 带重试的获取 PDF 页数
   */
  private async getPDFPageCountWithRetry(pdfPath: string): Promise<number> {
    return this.withRetry(
      async () => {
        const pngPages = await pdfToPng(pdfPath, {
          returnPageContent: false,
          verbosityLevel: 0,
        });

        if (pngPages.length === 0) {
          throw new Error("PDF file has no pages or is corrupted");
        }

        return pngPages.length;
      },
      "get PDF page count",
      // 密码保护和空文件错误不重试
      (error) =>
        !error.message?.includes("password") &&
        !error.message?.includes("no pages")
    );
  }

  /**
   * 通用重试包装器
   *
   * @param fn 要执行的异步函数
   * @param operationName 操作名称（用于日志）
   * @param shouldRetry 判断是否应该重试的函数（返回 false 则不重试）
   * @returns 函数执行结果
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
    shouldRetry: (error: Error) => boolean = () => true
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // 判断是否应该重试
        if (!shouldRetry(error)) {
          console.error(
            `[PDFSplitter] ${operationName} failed (non-retryable): ${error.message}`
          );
          throw this.wrapError(error);
        }

        // 最后一次尝试失败，不再重试
        if (attempt === this.MAX_RETRIES) {
          console.error(
            `[PDFSplitter] ${operationName} failed after ${this.MAX_RETRIES} attempts: ${error.message}`
          );
          break;
        }

        // 指数退避：1s, 2s, 4s
        const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
        console.warn(
          `[PDFSplitter] ${operationName} attempt ${attempt}/${this.MAX_RETRIES} failed: ${error.message}. Retrying in ${delay}ms...`
        );

        await this.sleep(delay);
      }
    }

    throw this.wrapError(lastError!);
  }

  /**
   * 包装错误信息，提供更友好的错误提示
   */
  private wrapError(error: Error): Error {
    if (error.message?.includes("password")) {
      return new Error("PDF is password protected");
    }
    if (error.message?.includes("no pages")) {
      return new Error("PDF file has no pages or is corrupted");
    }
    return new Error(`PDF processing failed: ${error.message}`);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 根据任务ID和页码生成图片路径
   * 这是一个静态工具方法，供其他模块使用
   */
  static getImagePath(tempDir: string, taskId: string, page: number): string {
    return path.join(tempDir, taskId, `page-${page}.png`);
  }

  async cleanup(taskId: string): Promise<void> {
    const outputDir = path.join(this.tempDir, taskId);
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      console.log(`[PDFSplitter] Cleaned up temp files for task ${taskId}`);
    } catch (error) {
      console.warn(
        `[PDFSplitter] Failed to cleanup temp files for task ${taskId}:`,
        error
      );
    }
  }
}
```

### 5.2 ImageSplitter

```typescript
import path from "path";
import fs from "fs/promises";
import { app } from "electron";

/**
 * 图片处理器
 *
 * 为保持与 PDFSplitter 的一致性，将原图复制到 tempDir/{taskId}/ 目录
 * 文件命名规则：{tempDir}/{taskId}/page-1.{ext}
 */
class ImageSplitter implements ISplitter {
  private readonly uploadDir: string;
  private readonly tempDir: string;

  constructor() {
    this.uploadDir = path.join(app.getPath("userData"), "uploads");
    this.tempDir = path.join(app.getPath("userData"), "temp");
  }

  async split(task: Task): Promise<SplitResult> {
    const sourcePath = path.join(this.uploadDir, task.filename);
    const outputDir = path.join(this.tempDir, task.id);

    // 1. 验证源文件存在
    try {
      await fs.access(sourcePath);
    } catch {
      throw new Error(`Image file not found: ${task.filename}`);
    }

    // 2. 创建输出目录
    await fs.mkdir(outputDir, { recursive: true });

    // 3. 获取文件扩展名
    const ext = path.extname(task.filename).toLowerCase();
    const targetFileName = `page-1${ext}`;
    const targetPath = path.join(outputDir, targetFileName);

    // 4. 复制图片到临时目录
    await fs.copyFile(sourcePath, targetPath);

    console.log(
      `[ImageSplitter] Copied ${task.filename} to ${targetPath}`
    );

    // 图片文件只有一页，page_range 对图片无意义，忽略
    const pages: PageInfo[] = [
      {
        page: 1,
        pageSource: 1,
        imagePath: targetPath,
      },
    ];

    return {
      pages,
      totalPages: 1,
    };
  }

  async cleanup(taskId: string): Promise<void> {
    const outputDir = path.join(this.tempDir, taskId);
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      console.log(`[ImageSplitter] Cleaned up temp files for task ${taskId}`);
    } catch (error) {
      console.warn(
        `[ImageSplitter] Failed to cleanup temp files for task ${taskId}:`,
        error
      );
    }
  }
}
```

### 5.3 SplitterWorker

```typescript
import { WorkerBase } from "./WorkerBase.js";
import { TaskStatus, PageStatus } from "../types/Task.js";
import { prisma } from "../db/index.js";

/**
 * 拆分Worker
 */
class SplitterWorker extends WorkerBase {
  private readonly POLL_INTERVAL = 2000; // 2秒

  async run(): Promise<void> {
    this.isRunning = true;
    console.log(`[Splitter-${this.workerId}] Started`);

    while (this.isRunning) {
      try {
        // 1. 抢占待拆分的任务
        const task = await this.claimTask(
          TaskStatus.PENDING,
          TaskStatus.SPLITTING
        );

        if (!task) {
          await this.sleep(this.POLL_INTERVAL);
          continue;
        }

        console.log(`[Splitter-${this.workerId}] Claimed task ${task.id}`);

        // 2. 执行拆分
        await this.splitTask(task);
      } catch (error) {
        console.error(`[Splitter-${this.workerId}] Fatal error:`, error);
        await this.sleep(this.POLL_INTERVAL);
      }
    }

    console.log(`[Splitter-${this.workerId}] Stopped`);
  }

  /**
   * 拆分任务
   */
  private async splitTask(task: Task): Promise<void> {
    try {
      // 1. 获取文件类型
      const fileType = SplitterFactory.getFileType(task.filename);
      console.log(
        `[Splitter-${this.workerId}] Task ${task.id}: file type = ${fileType}`
      );

      // 2. 创建拆分器
      const splitter = SplitterFactory.create(fileType);

      // 3. 执行拆分
      const result = await splitter.split(task);
      console.log(
        `[Splitter-${this.workerId}] Task ${task.id}: split into ${result.totalPages} pages`
      );

      // 4. 创建 TaskDetail 记录并更新任务状态（原子操作）
      await this.createTaskDetails(task, result);

      console.log(
        `[Splitter-${this.workerId}] Task ${task.id}: SPLITTING → PROCESSING`
      );
    } catch (error) {
      console.error(
        `[Splitter-${this.workerId}] Error splitting task ${task.id}:`,
        error
      );
      await this.handleError(task.id, error as Error);
    }
  }

  /**
   * 创建TaskDetail记录（事务）
   *
   * 注意：不存储 image_path，图片路径通过 taskId + page 动态计算
   */
  private async createTaskDetails(
    task: Task,
    result: SplitResult
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. 批量创建 TaskDetail
      // 注意：image_path 不存储，由 ImagePathUtil.getPath(taskId, page) 动态计算
      const details = result.pages.map((page) => ({
        task: task.id,
        page: page.page,
        page_source: page.pageSource,
        status: PageStatus.PENDING,
        provider: task.provider,
        model: task.model,
        content: "",
      }));

      await tx.taskDetail.createMany({ data: details });

      // 2. 更新任务状态为 PROCESSING
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.PROCESSING,
          pages: result.totalPages,
          worker_id: null, // 释放占用
          updatedAt: new Date(),
        },
      });
    });
  }
}
```

---

## 6. 测试策略

### 6.1 单元测试

```typescript
// tests/server/logic/split/PageRangeParser.test.ts
describe("PageRangeParser", () => {
  describe("parse", () => {
    it("should parse empty string as all pages", () => {
      const result = PageRangeParser.parse("", 10);
      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("should parse single page", () => {
      expect(PageRangeParser.parse("5", 10)).toEqual([5]);
    });

    it("should parse range", () => {
      expect(PageRangeParser.parse("3-7", 10)).toEqual([3, 4, 5, 6, 7]);
    });

    it("should parse complex range", () => {
      expect(PageRangeParser.parse("1-5,7,11-14,23", 30)).toEqual([
        1, 2, 3, 4, 5, 7, 11, 12, 13, 14, 23,
      ]);
    });

    it("should handle whitespace", () => {
      expect(PageRangeParser.parse(" 1-3 , 5 , 8-10 ", 10)).toEqual([
        1, 2, 3, 5, 8, 9, 10,
      ]);
    });

    it("should throw error for invalid format", () => {
      expect(() => PageRangeParser.parse("abc", 10)).toThrow();
      expect(() => PageRangeParser.parse("1-", 10)).toThrow();
    });

    it("should throw error for out of bounds", () => {
      expect(() => PageRangeParser.parse("1-20", 10)).toThrow();
      expect(() => PageRangeParser.parse("0", 10)).toThrow();
    });
  });

  describe("validate", () => {
    it("should validate correct formats", () => {
      expect(PageRangeParser.validate("")).toBe(true);
      expect(PageRangeParser.validate("1")).toBe(true);
      expect(PageRangeParser.validate("1-5")).toBe(true);
      expect(PageRangeParser.validate("1-5,7,11-14")).toBe(true);
    });

    it("should reject invalid formats", () => {
      expect(PageRangeParser.validate("abc")).toBe(false);
      expect(PageRangeParser.validate("1-")).toBe(false);
      expect(PageRangeParser.validate("1--5")).toBe(false);
    });
  });
});
```

```typescript
// tests/server/logic/split/SplitterFactory.test.ts
describe("SplitterFactory", () => {
  describe("create", () => {
    it("should create PDFSplitter for pdf", () => {
      const splitter = SplitterFactory.create("pdf");
      expect(splitter).toBeInstanceOf(PDFSplitter);
    });

    it("should create ImageSplitter for image types", () => {
      expect(SplitterFactory.create("jpg")).toBeInstanceOf(ImageSplitter);
      expect(SplitterFactory.create("jpeg")).toBeInstanceOf(ImageSplitter);
      expect(SplitterFactory.create("png")).toBeInstanceOf(ImageSplitter);
    });

    it("should throw error for unsupported type", () => {
      expect(() => SplitterFactory.create("doc")).toThrow();
    });
  });

  describe("getFileType", () => {
    it("should extract file type from filename", () => {
      expect(SplitterFactory.getFileType("test.pdf")).toBe("pdf");
      expect(SplitterFactory.getFileType("image.jpg")).toBe("jpg");
    });

    it("should handle uppercase extensions", () => {
      expect(SplitterFactory.getFileType("TEST.PDF")).toBe("pdf");
    });

    it("should throw error for no extension", () => {
      expect(() => SplitterFactory.getFileType("noext")).toThrow();
    });
  });
});
```

### 6.2 集成测试

```typescript
// tests/server/logic/split/PDFSplitter.test.ts
describe("PDFSplitter", () => {
  let splitter: PDFSplitter;
  let testTask: Task;

  beforeEach(() => {
    splitter = new PDFSplitter();
    testTask = {
      id: "test-task-1",
      filename: "test.pdf",
      page_range: "1-3",
      // ... other fields
    };
  });

  it("should split PDF into images", async () => {
    const result = await splitter.split(testTask);

    expect(result.totalPages).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].page).toBe(1);
    expect(result.pages[0].imagePath).toContain(".png");
  });

  it("should handle page range", async () => {
    testTask.page_range = "1,3,5";
    const result = await splitter.split(testTask);

    expect(result.totalPages).toBe(3);
    expect(result.pages[0].pageSource).toBe(1);
    expect(result.pages[1].pageSource).toBe(3);
    expect(result.pages[2].pageSource).toBe(5);

    // 验证文件命名规则
    expect(result.pages[0].imagePath).toContain("page-1.png");
    expect(result.pages[1].imagePath).toContain("page-2.png");
    expect(result.pages[2].imagePath).toContain("page-3.png");
  });
});
```

```typescript
// tests/server/logic/split/ImageSplitter.test.ts
describe("ImageSplitter", () => {
  let splitter: ImageSplitter;
  let testTask: Task;

  beforeEach(() => {
    splitter = new ImageSplitter();
    testTask = {
      id: "test-task-2",
      filename: "test.jpg",
      page_range: "",
      // ... other fields
    };
  });

  it("should copy image to temp directory", async () => {
    const result = await splitter.split(testTask);

    expect(result.totalPages).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].page).toBe(1);
    expect(result.pages[0].pageSource).toBe(1);
    // 验证图片被复制到 tempDir/{taskId}/page-1.{ext}
    expect(result.pages[0].imagePath).toContain("test-task-2");
    expect(result.pages[0].imagePath).toContain("page-1.jpg");
  });

  it("should preserve file extension", async () => {
    testTask.filename = "test.png";
    const result = await splitter.split(testTask);

    expect(result.pages[0].imagePath).toContain("page-1.png");
  });

  it("should throw error for non-existent file", async () => {
    testTask.filename = "non-existent.jpg";

    await expect(splitter.split(testTask)).rejects.toThrow(
      "Image file not found"
    );
  });

  it("should cleanup temp files", async () => {
    await splitter.split(testTask);
    await splitter.cleanup(testTask.id);

    // 验证临时目录已删除
    const tempDir = path.join(app.getPath("userData"), "temp", testTask.id);
    await expect(fs.access(tempDir)).rejects.toThrow();
  });
});
```

---

## 7. 集成方案

### 7.1 文件结构

```
src/server/logic/split/
├── index.ts                    # 导出所有拆分器
├── PageRangeParser.ts          # 页面范围解析器
├── ISplitter.ts                # 拆分器接口
├── ImagePathUtil.ts            # 图片路径工具类（新增）
├── SplitterFactory.ts          # 工厂类
├── PDFSplitter.ts              # PDF拆分器
├── ImageSplitter.ts            # 图片处理器
└── __tests__/
    ├── PageRangeParser.test.ts
    ├── SplitterFactory.test.ts
    ├── ImagePathUtil.test.ts   # 新增
    ├── PDFSplitter.test.ts
    └── ImageSplitter.test.ts

src/server/workers/
├── WorkerBase.ts               # Worker基类
├── SplitterWorker.ts           # 拆分Worker
├── ConverterWorker.ts          # 转换Worker
├── MergerWorker.ts             # 合并Worker
├── HealthChecker.ts            # 健康检查
└── TaskOrchestrator.ts         # 任务编排器
```

### 7.2 导出模块

```typescript
// src/server/logic/split/index.ts
export { PageRangeParser } from "./PageRangeParser.js";
export { ISplitter, SplitResult, PageInfo } from "./ISplitter.js";
export { ImagePathUtil } from "./ImagePathUtil.js";
export { SplitterFactory } from "./SplitterFactory.js";
export { PDFSplitter } from "./PDFSplitter.js";
export { ImageSplitter } from "./ImageSplitter.js";
```

### 7.3 ImagePathUtil 初始化

```typescript
// src/main/index.ts 或 src/server/workers/TaskOrchestrator.ts
import { app } from "electron";
import path from "path";
import { ImagePathUtil } from "../logic/split/index.js";

// 在应用启动时初始化
const tempDir = path.join(app.getPath("userData"), "temp");
ImagePathUtil.init(tempDir);
```

### 7.4 ConverterWorker 使用示例

```typescript
// ConverterWorker 中获取图片路径
import { ImagePathUtil } from "../logic/split/index.js";

class ConverterWorker extends WorkerBase {
  private async convertToMarkdown(page: TaskDetail): Promise<string> {
    // 动态计算图片路径，无需从数据库读取
    const imagePath = ImagePathUtil.getPath(page.task, page.page);

    const imageBase64 = await this.readImageAsBase64(imagePath);
    const client = this.getLLMClient(page.provider, page.model);
    const markdown = await client.imageToMarkdown(imageBase64);

    return markdown;
  }
}
```

### 7.5 TaskOrchestrator 集成

```typescript
// src/server/workers/TaskOrchestrator.ts
import { SplitterWorker } from "./SplitterWorker.js";
import { ConverterWorker } from "./ConverterWorker.js";
import { MergerWorker } from "./MergerWorker.js";
import { HealthChecker } from "./HealthChecker.js";

class TaskOrchestrator {
  private splitter: SplitterWorker;
  private converters: ConverterWorker[];
  private merger: MergerWorker;
  private healthChecker: HealthChecker;

  constructor(config: { converterCount: number }) {
    this.splitter = new SplitterWorker();
    this.converters = Array.from(
      { length: config.converterCount },
      (_, i) => new ConverterWorker(`converter-${i}`)
    );
    this.merger = new MergerWorker();
    this.healthChecker = new HealthChecker();
  }

  async start(): Promise<void> {
    console.log("[Orchestrator] Starting all workers...");

    this.healthChecker.start();

    // 启动所有workers（不阻塞）
    this.splitter
      .run()
      .catch((e) => console.error("[Splitter] Fatal error:", e));

    this.converters.forEach((c) =>
      c
        .run()
        .catch((e) =>
          console.error(`[Converter-${c["workerId"]}] Fatal error:`, e)
        )
    );

    this.merger.run().catch((e) => console.error("[Merger] Fatal error:", e));

    console.log("[Orchestrator] All workers started");
  }

  async stop(): Promise<void> {
    console.log("[Orchestrator] Stopping all workers...");

    this.healthChecker.stop();

    await Promise.all([
      this.splitter.stop(),
      ...this.converters.map((c) => c.stop()),
      this.merger.stop(),
    ]);

    console.log("[Orchestrator] All workers stopped");
  }
}

export default TaskOrchestrator;
```

### 7.6 主进程集成

```typescript
// src/main/index.ts
import TaskOrchestrator from "../server/workers/TaskOrchestrator.js";
import { ImagePathUtil } from "../server/logic/split/index.js";
import path from "path";

let orchestrator: TaskOrchestrator | null = null;

app.whenReady().then(async () => {
  // ... 其他初始化代码

  // 初始化 ImagePathUtil
  const tempDir = path.join(app.getPath("userData"), "temp");
  ImagePathUtil.init(tempDir);

  // 启动任务编排器
  orchestrator = new TaskOrchestrator({
    converterCount: 3, // 3个并发转换器
  });

  await orchestrator.start();

  // ... 创建窗口等
});

app.on("before-quit", async () => {
  if (orchestrator) {
    await orchestrator.stop();
  }
});
```

---

## 8. 依赖安装

```bash
# 安装 PDF 处理库
npm install pdf-to-png-converter

# 注意：pdf-to-png-converter 要求 Node.js >= 20
```

---

## 9. 配置参数

```typescript
// src/server/config/worker.config.ts
export const WORKER_CONFIG = {
  // 拆分器配置
  splitter: {
    pollInterval: 2000, // 轮询间隔（毫秒）
    viewportScale: 2.0, // PDF 转 PNG 缩放比例 (2.0 ≈ 144 DPI)
    imageFormat: "png", // 图片格式
    maxRetries: 3, // 最大重试次数
    retryDelayBase: 1000, // 重试基础延迟（毫秒），使用指数退避
  },

  // 转换器配置
  converter: {
    count: 3, // 并发数量
    pollInterval: 2000,
    timeout: 2 * 60 * 1000, // 2分钟超时
  },

  // 合并器配置
  merger: {
    pollInterval: 2000,
  },

  // 健康检查配置
  healthCheck: {
    interval: 60000, // 1分钟检查一次
    taskTimeout: 5 * 60 * 1000, // 5分钟任务超时
  },
};
```

---

## 10. 错误处理

### 10.1 常见错误

| 错误类型                      | 处理方式                        |
| ----------------------------- | ------------------------------- |
| PDF 文件损坏                  | 标记任务为 FAILED，记录错误信息 |
| 页面范围无效                  | 标记任务为 FAILED，提示用户修正 |
| 磁盘空间不足                  | 标记任务为 FAILED，清理临时文件 |
| pdf-to-png-converter 转换失败 | 重试 3 次，失败后标记 FAILED    |
| 图片文件不存在                | 标记任务为 FAILED               |
| 密码保护的 PDF                | 提示用户输入密码（需前端支持）  |

### 10.2 错误日志

```typescript
// 错误日志格式
console.error(`[Splitter-${workerId}] Error splitting task ${taskId}:`, {
  error: error.message,
  stack: error.stack,
  task: {
    id: task.id,
    filename: task.filename,
    page_range: task.page_range,
  },
});
```

---

## 11. 性能优化

### 11.1 批量处理

- pdf-to-png-converter 原生支持批量转换指定页面 (`pagesToProcess`)
- TaskDetail 批量创建（使用`createMany`）
- 可配置 `processPagesInParallel: true` 并行处理页面（大文件慎用）

### 11.2 并发控制

- SplitterWorker 单实例，避免重复拆分
- 使用数据库事务保证原子性

### 11.3 内存管理

- 及时清理临时文件
- 避免一次性加载大文件到内存

---

## 12. 后续扩展

### 12.1 支持更多文件类型

- TIFF
- BMP
- GIF

### 12.2 高级功能

- PDF 密码保护支持
- 图片预处理（旋转、裁剪）
- OCR 文本提取

---

**文档结束**
