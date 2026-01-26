# Office 文件支持扩展设计方案

## 概述

本文档描述如何扩展 MarkPDFdown Desktop 以支持 Word、PowerPoint 和 Excel 文件的转换。

### 目标

- 支持 `word` 类型（.docx, .dotx）
- 支持 `powerpoint` 类型（.pptx, .potx）
- 支持 `excel` 类型（.xlsx, .xltx, .csv）
- 支持页面范围选择（与 PDF 功能对齐）
- 各格式使用专门的解析库，确保最佳兼容性
- 复用 Electron 渲染能力，无需额外浏览器进程

### 设计原则

- 统一使用 `docType`（文档类型）进行分支判断，而非文件扩展名
- 遵循现有清洁架构（ISplitter 接口 → SplitterFactory）
- 每种 Office 格式独立 Splitter 类，使用最适合的解析库
- 安全优先：验证文件路径，防止路径遍历攻击

### 不支持的格式

以下旧格式（OLE 复合文档）**不支持**，因为依赖库无法处理：

- `.doc`, `.dot` (旧版 Word)
- `.ppt`, `.pot` (旧版 PowerPoint)
- `.xls`, `.xlt` (旧版 Excel)

如需处理这些格式，建议用户先用 Microsoft Office 或 LibreOffice 转换为新格式。

---

## 架构设计

### 1. 文档类型定义

```typescript
// src/shared/types/DocType.ts
export enum DocType {
  PDF = 'pdf',
  IMAGE = 'image',
  WORD = 'word',
  POWERPOINT = 'powerpoint',
  EXCEL = 'excel',
}

// 扩展名到文档类型的映射（仅支持 Office Open XML 格式）
export const EXTENSION_TO_DOCTYPE: Record<string, DocType> = {
  // PDF
  'pdf': DocType.PDF,

  // Image
  'jpg': DocType.IMAGE,
  'jpeg': DocType.IMAGE,
  'png': DocType.IMAGE,
  'webp': DocType.IMAGE,

  // Word (仅 Office Open XML 格式)
  'docx': DocType.WORD,
  'dotx': DocType.WORD,

  // PowerPoint (仅 Office Open XML 格式)
  'pptx': DocType.POWERPOINT,
  'potx': DocType.POWERPOINT,

  // Excel (仅 Office Open XML 格式 + CSV)
  'xlsx': DocType.EXCEL,
  'xltx': DocType.EXCEL,
  'csv': DocType.EXCEL,
};

// 不支持的旧格式（用于友好提示）
export const LEGACY_FORMATS = ['doc', 'dot', 'ppt', 'pot', 'xls', 'xlt'];

/**
 * 检查是否为不支持的旧格式
 */
export function isLegacyFormat(ext: string): boolean {
  return LEGACY_FORMATS.includes(ext.toLowerCase().replace('.', ''));
}
```

### 2. 类图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Domain Layer                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐    ┌────────────────┐                            │
│  │   <<interface>>   │    │    DocType     │                            │
│  │    ISplitter      │    │    (enum)      │                            │
│  ├───────────────────┤    ├────────────────┤                            │
│  │ + split(task)     │    │ PDF           │                            │
│  │ + cleanup(taskId) │    │ IMAGE         │                            │
│  └───────────────────┘    │ WORD          │                            │
│           ▲               │ POWERPOINT    │                            │
│           │               │ EXCEL         │                            │
│           │               └────────────────┘                            │
├───────────┼─────────────────────────────────────────────────────────────┤
│           │              Infrastructure Layer                            │
├───────────┼─────────────────────────────────────────────────────────────┤
│  ┌────────┴─────────┬──────────────────┬──────────────────┐             │
│  │                  │                  │                  │             │
│  ▼                  ▼                  ▼                  ▼             │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│ │ PDFSplitter  │ │ImageSplitter │ │ WordSplitter │ │  PPTSplitter │    │
│ ├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤    │
│ │ pdf-to-png   │ │ fs.copyFile  │ │ mammoth      │ │ JSZip        │    │
│ │ pdf-lib      │ │              │ │ (DOCX→HTML)  │ │ (PPTX解压)   │    │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                                         │
│                                   ┌──────────────┐                      │
│                                   │ExcelSplitter │                      │
│                                   ├──────────────┤                      │
│                                   │ exceljs      │                      │
│                                   │ papaparse    │                      │
│                                   └──────────────┘                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    共享辅助模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ - RenderWindowPoolFactory: 窗口池工厂（非单例）                   │   │
│  │ - TempFileManager: 临时 HTML 文件管理                            │   │
│  │ - PathValidator: 路径安全验证（防止路径遍历）                     │   │
│  │ - ChunkedRenderer: 分段截图渲染器（内存优化）                     │   │
│  │ - PageRangeParser: 页面范围解析                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    SplitterFactory (修改)                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ + create(docType: DocType): ISplitter                           │   │
│  │ + getDocType(filename: string): DocType                         │   │
│  │ + createFromFilename(filename: string): ISplitter               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. 处理流程

```
┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
│     上传文件      │───▶│  SplitterFactory   │───▶│   具体 Splitter     │
│ .docx/.pptx/.xlsx│    │  getDocType()      │    │                     │
└──────────────────┘    │  create(docType)   │    └──────────┬──────────┘
                        └────────────────────┘               │
                                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         WordSplitter                                    │
├────────────────────────────────────────────────────────────────────────┤
│  1. mammoth 解析 DOCX → HTML（保留样式、表格、图片）                      │
│  2. 渲染 HTML → 分段截图（每 4000px）                                    │
│  3. 按 A4 高度切分为页面                                                 │
│  4. pageRange 基于渲染后页码过滤                                         │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                       PowerPointSplitter                                │
├────────────────────────────────────────────────────────────────────────┤
│  1. JSZip 解压 PPTX 文件                                                │
│  2. 解析 ppt/slides/slide*.xml 获取幻灯片列表                           │
│  3. 每张幻灯片独立构建 HTML                                              │
│  4. 渲染为固定尺寸 PNG（16:9）                                          │
│  5. pageRange 基于幻灯片编号过滤                                         │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        ExcelSplitter                                    │
├────────────────────────────────────────────────────────────────────────┤
│  1. exceljs 解析 XLSX / papaparse 解析 CSV                              │
│  2. 获取 Sheet 列表和数据                                               │
│  3. 每个 Sheet 构建 HTML 表格                                           │
│  4. 分段截图 + 垂直分页                                                  │
│  5. pageRange 基于 Sheet 索引过滤                                   │
└────────────────────────────────────────────────────────────────────────┘

                                        │
                                        ▼
                   ┌────────────────────────────────────────────────────┐
                   │              SplitResult                            │
                   │  { pages: PageInfo[], totalPages: number }         │
                   └────────────────────────────────────────────────────┘
```

---

## 详细设计

### 1. 路径安全验证器

```typescript
// src/core/infrastructure/adapters/split/PathValidator.ts
import path from 'path';

/**
 * 路径安全验证器
 *
 * 防止路径遍历攻击（如 ../../../etc/passwd）
 */
export class PathValidator {
  /**
   * 验证文件路径是否在允许的目录内
   *
   * @param filePath - 待验证的文件路径
   * @param allowedDir - 允许的根目录
   * @throws 如果路径不在允许目录内
   */
  static validate(filePath: string, allowedDir: string): void {
    const resolvedPath = path.resolve(filePath);
    const resolvedAllowedDir = path.resolve(allowedDir);

    // 修复：支持路径等于允许目录本身的情况
    const isWithinDir =
      resolvedPath === resolvedAllowedDir ||
      resolvedPath.startsWith(resolvedAllowedDir + path.sep);

    if (!isWithinDir) {
      throw new Error(
        `Security error: Path "${filePath}" is outside allowed directory. ` +
        `Possible path traversal attack detected.`
      );
    }
  }

  /**
   * 安全地拼接路径并验证
   *
   * @param baseDir - 基础目录
   * @param segments - 路径片段
   * @returns 验证后的完整路径
   */
  static safePath(baseDir: string, ...segments: string[]): string {
    // 循环移除 .. 直到没有变化（防止 .... 等绕过）
    const sanitizedSegments = segments.map(seg => {
      let prev = '';
      let current = seg;
      while (prev !== current) {
        prev = current;
        current = current
          .replace(/\.\./g, '')
          .replace(/^[/\\]+/, '')
          .replace(/[/\\]+$/, '');
      }
      return current;
    });

    const fullPath = path.join(baseDir, ...sanitizedSegments);
    this.validate(fullPath, baseDir);

    return fullPath;
  }
}
```

### 2. 页面范围解析器

```typescript
// src/core/infrastructure/adapters/split/PageRangeParser.ts

export interface ParsedRange {
  /** 包含的页码/索引列表（1-based） */
  indices: number[];
  /** 原始范围字符串 */
  raw: string;
}

export interface SheetRange {
  /** 按索引指定（1-based） */
  indices: number[];
  /** 原始范围字符串 */
  raw: string;
}

/**
 * 页面范围解析器
 *
 * 支持格式（所有文档类型统一）：
 * - 单页/单 Sheet: "3"
 * - 范围: "1-5"
 * - 混合: "1,3,5-10"
 */
export class PageRangeParser {
  /**
   * 解析数字页码范围
   *
   * @param range - 范围字符串，如 "1-3,5,7-9"
   * @param maxPage - 最大页码（用于验证和开区间）
   */
  static parseNumeric(range: string | undefined, maxPage: number): ParsedRange {
    if (!range || range.trim() === '') {
      // 未指定范围，返回全部页
      return {
        indices: Array.from({ length: maxPage }, (_, i) => i + 1),
        raw: '',
      };
    }

    const indices = new Set<number>();
    const parts = range.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        // 范围格式: "1-5"
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = parseInt(startStr, 10);
        const end = endStr === '' ? maxPage : parseInt(endStr, 10);

        if (isNaN(start) || isNaN(end)) {
          throw new Error(`Invalid range format: "${part}"`);
        }
        if (start < 1 || end > maxPage || start > end) {
          throw new Error(
            `Range "${part}" is out of bounds (valid: 1-${maxPage})`
          );
        }

        for (let i = start; i <= end; i++) {
          indices.add(i);
        }
      } else {
        // 单页格式: "3"
        const page = parseInt(part, 10);
        if (isNaN(page)) {
          throw new Error(`Invalid page number: "${part}"`);
        }
        if (page < 1 || page > maxPage) {
          throw new Error(
            `Page ${page} is out of bounds (valid: 1-${maxPage})`
          );
        }
        indices.add(page);
      }
    }

    return {
      indices: Array.from(indices).sort((a, b) => a - b),
      raw: range,
    };
  }

  /**
   * 解析 Excel Sheet 范围
   *
   * 使用与页码相同的格式：
   * - 单个: "1"
   * - 范围: "1-3"
   * - 混合: "1,3,5-7"
   *
   * @param range - 范围字符串
   * @param sheetCount - Sheet 总数
   */
  static parseSheetRange(
    range: string | undefined,
    sheetCount: number
  ): SheetRange {
    if (!range || range.trim() === '') {
      // 未指定，返回全部 Sheet
      return {
        indices: Array.from({ length: sheetCount }, (_, i) => i + 1),
        raw: '',
      };
    }

    const parsed = this.parseNumeric(range, sheetCount);
    return {
      indices: parsed.indices,
      raw: range,
    };
  }

  /**
   * 根据 SheetRange 过滤 Sheet 列表
   */
  static filterSheets(
    sheetNames: string[],
    range: SheetRange
  ): string[] {
    // 按索引过滤（1-based）
    return range.indices.map(i => sheetNames[i - 1]);
  }
}
```

### 3. 渲染窗口池工厂

```typescript
// src/core/infrastructure/adapters/split/RenderWindowPoolFactory.ts
import { BrowserWindow } from 'electron';

interface PooledWindow {
  window: BrowserWindow;
  busy: boolean;
}

interface WaitingRequest {
  resolve: (window: BrowserWindow) => void;
  reject: (error: Error) => void;
  width: number;
  height: number;
  timer: NodeJS.Timeout;
}

/**
 * 窗口池配置
 */
export interface RenderWindowPoolConfig {
  /** 最大窗口数量 */
  maxSize: number;
  /** 等待超时时间（毫秒） */
  acquireTimeout: number;
}

const DEFAULT_CONFIG: RenderWindowPoolConfig = {
  maxSize: 3,
  acquireTimeout: 60000, // 60 秒
};

/**
 * BrowserWindow 渲染窗口池
 *
 * 避免频繁创建/销毁窗口，控制并发资源消耗
 * 包含超时机制防止无限等待
 *
 * 注意：使用工厂模式创建，每个 Splitter 可拥有独立的窗口池
 */
export class RenderWindowPool {
  private pool: PooledWindow[] = [];
  private readonly config: RenderWindowPoolConfig;
  private waitQueue: WaitingRequest[] = [];
  private destroyed = false;

  constructor(config: RenderWindowPoolConfig) {
    this.config = config;
  }

  /**
   * 获取一个可用的渲染窗口
   *
   * @throws 如果等待超时或池已销毁
   */
  async acquire(width: number, height: number): Promise<BrowserWindow> {
    if (this.destroyed) {
      throw new Error('RenderWindowPool has been destroyed');
    }

    // 查找空闲窗口
    const available = this.pool.find(p => !p.busy);
    if (available) {
      available.busy = true;
      available.window.setSize(width, height);
      return available.window;
    }

    // 池未满则创建新窗口
    if (this.pool.length < this.config.maxSize) {
      const window = this.createWindow(width, height);
      this.pool.push({ window, busy: true });
      return window;
    }

    // 池已满，等待释放（带超时）
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 移除等待请求
        const index = this.waitQueue.findIndex(r => r.timer === timer);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error(
          `RenderWindowPool acquire timeout after ${this.config.acquireTimeout}ms. ` +
          `All ${this.config.maxSize} windows are busy.`
        ));
      }, this.config.acquireTimeout);

      this.waitQueue.push({
        resolve,
        reject,
        width,
        height,
        timer,
      });
    });
  }

  /**
   * 释放窗口回池
   */
  async release(window: BrowserWindow): Promise<void> {
    const pooled = this.pool.find(p => p.window === window);
    if (!pooled) return;

    // 检查窗口是否仍然有效
    if (window.isDestroyed()) {
      // 窗口已销毁，从池中移除
      const index = this.pool.indexOf(pooled);
      if (index !== -1) {
        this.pool.splice(index, 1);
      }
      return;
    }

    // 清理窗口状态（等待完成）
    try {
      await window.loadURL('about:blank');
    } catch {
      // 忽略清理失败
    }

    // 如果有等待者，直接分配
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      clearTimeout(waiter.timer);
      window.setSize(waiter.width, waiter.height);
      waiter.resolve(window);
    } else {
      pooled.busy = false;
    }
  }

  /**
   * 销毁所有窗口
   */
  destroy(): void {
    this.destroyed = true;

    // 拒绝所有等待中的请求
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('RenderWindowPool is being destroyed'));
    }
    this.waitQueue = [];

    // 销毁所有窗口
    for (const pooled of this.pool) {
      if (!pooled.window.isDestroyed()) {
        pooled.window.destroy();
      }
    }
    this.pool = [];
  }

  /**
   * 获取当前池状态（用于调试）
   */
  getStatus(): { total: number; busy: number; waiting: number } {
    return {
      total: this.pool.length,
      busy: this.pool.filter(p => p.busy).length,
      waiting: this.waitQueue.length,
    };
  }

  private createWindow(width: number, height: number): BrowserWindow {
    return new BrowserWindow({
      show: false,
      width,
      height,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });
  }
}

/**
 * 窗口池工厂
 *
 * 每次调用创建独立的窗口池实例
 */
export class RenderWindowPoolFactory {
  /**
   * 创建新的窗口池实例
   */
  static create(config: Partial<RenderWindowPoolConfig> = {}): RenderWindowPool {
    return new RenderWindowPool({
      ...DEFAULT_CONFIG,
      ...config,
    });
  }
}
```

### 4. 分段截图渲染器

```typescript
// src/core/infrastructure/adapters/split/ChunkedRenderer.ts
import { BrowserWindow } from 'electron';
import { promises as fs } from 'fs';

/**
 * 分段截图配置
 */
export interface ChunkedRenderConfig {
  /** 每段截图高度（像素） */
  chunkHeight: number;
  /** 设备缩放因子 */
  deviceScaleFactor: number;
  /** 页面宽度 */
  pageWidth: number;
  /** 分页高度（用于切分输出） */
  pageHeight: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkedRenderConfig = {
  chunkHeight: 4000,
  deviceScaleFactor: 2,
  pageWidth: 794,
  pageHeight: 1123,
};

/**
 * 分段截图渲染器
 *
 * 解决大文档单次截图内存过大的问题
 * 每次只截取 chunkHeight 高度的区域
 */
export class ChunkedRenderer {
  private readonly config: ChunkedRenderConfig;

  constructor(config: Partial<ChunkedRenderConfig> = {}) {
    this.config = { ...DEFAULT_CHUNK_CONFIG, ...config };
  }

  /**
   * 分段截图并切分为页面
   *
   * @param window - 渲染窗口
   * @param totalHeight - 文档总高度（CSS 像素）
   * @param outputPathFn - 输出路径生成函数 (pageNum) => path
   * @returns 生成的页面数量
   */
  async renderToPages(
    window: BrowserWindow,
    totalHeight: number,
    outputPathFn: (pageNum: number) => string
  ): Promise<number> {
    const { chunkHeight, deviceScaleFactor, pageWidth, pageHeight } = this.config;
    const sharp = (await import('sharp')).default;

    const scaledChunkHeight = chunkHeight * deviceScaleFactor;
    const scaledPageHeight = pageHeight * deviceScaleFactor;
    const scaledPageWidth = pageWidth * deviceScaleFactor;

    let pageNum = 1;
    let processedHeight = 0;
    let carryOverBuffer: Buffer | null = null;
    let carryOverHeight = 0;

    while (processedHeight < totalHeight) {
      // 计算本次截图区域
      const captureHeight = Math.min(chunkHeight, totalHeight - processedHeight);

      // 滚动到目标位置
      await window.webContents.executeJavaScript(
        `window.scrollTo(0, ${processedHeight})`
      );
      await this.sleep(50);

      // 截取当前区域
      const image = await window.webContents.capturePage({
        x: 0,
        y: 0,
        width: pageWidth,
        height: captureHeight,
      });
      const chunkBuffer = image.toPNG();

      // 合并上一段的剩余部分
      let workingBuffer: Buffer;
      let workingHeight: number;

      if (carryOverBuffer) {
        // 垂直拼接 carryOver + 当前 chunk
        workingBuffer = await sharp(carryOverBuffer)
          .extend({
            bottom: captureHeight * deviceScaleFactor,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .composite([{
            input: chunkBuffer,
            top: carryOverHeight,
            left: 0,
          }])
          .toBuffer();
        workingHeight = carryOverHeight + captureHeight * deviceScaleFactor;
        carryOverBuffer = null;
        carryOverHeight = 0;
      } else {
        workingBuffer = chunkBuffer;
        workingHeight = captureHeight * deviceScaleFactor;
      }

      // 从 workingBuffer 切分出完整页面
      let extractedHeight = 0;
      while (extractedHeight + scaledPageHeight <= workingHeight) {
        const outputPath = outputPathFn(pageNum);
        await sharp(workingBuffer)
          .extract({
            left: 0,
            top: extractedHeight,
            width: scaledPageWidth,
            height: scaledPageHeight,
          })
          .toFile(outputPath);

        pageNum++;
        extractedHeight += scaledPageHeight;
      }

      // 保存剩余部分用于下一轮
      if (extractedHeight < workingHeight) {
        const remainingHeight = workingHeight - extractedHeight;
        carryOverBuffer = await sharp(workingBuffer)
          .extract({
            left: 0,
            top: extractedHeight,
            width: scaledPageWidth,
            height: remainingHeight,
          })
          .toBuffer();
        carryOverHeight = remainingHeight;
      }

      processedHeight += captureHeight;
    }

    // 处理最后的剩余部分（不足一页）
    if (carryOverBuffer && carryOverHeight > 0) {
      const outputPath = outputPathFn(pageNum);
      await sharp(carryOverBuffer).toFile(outputPath);
      pageNum++;
    }

    return pageNum - 1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 5. 临时文件管理器

```typescript
// src/core/infrastructure/adapters/split/TempFileManager.ts
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

/**
 * 临时文件管理器
 *
 * 用于创建和清理 HTML 渲染临时文件
 * 解决 data URL 长度限制问题
 */
export class TempFileManager {
  private static readonly TEMP_PREFIX = 'markpdfdown-render-';
  private tempFiles: Set<string> = new Set();

  /**
   * 创建临时 HTML 文件
   */
  async createHtmlFile(html: string): Promise<string> {
    const tempDir = os.tmpdir();
    const filename = `${TempFileManager.TEMP_PREFIX}${randomUUID()}.html`;
    const filepath = path.join(tempDir, filename);

    await fs.writeFile(filepath, html, 'utf-8');
    this.tempFiles.add(filepath);

    return filepath;
  }

  /**
   * 删除单个临时文件
   */
  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      this.tempFiles.delete(filepath);
    } catch {
      // 文件可能已被删除，忽略错误
    }
  }

  /**
   * 清理所有临时文件
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.tempFiles).map(f => this.deleteFile(f));
    await Promise.allSettled(promises);
    this.tempFiles.clear();
  }
}
```

### 6. SplitterFactory 改造

```typescript
// src/core/infrastructure/adapters/split/SplitterFactory.ts
import path from 'path';
import { ISplitter } from '../../../domain/split/ISplitter.js';
import { PDFSplitter } from './PDFSplitter.js';
import { ImageSplitter } from './ImageSplitter.js';
import { WordSplitter } from './WordSplitter.js';
import { PowerPointSplitter } from './PowerPointSplitter.js';
import { ExcelSplitter } from './ExcelSplitter.js';
import { DocType, EXTENSION_TO_DOCTYPE, isLegacyFormat } from '../../../../shared/types/DocType.js';

export class SplitterFactory {
  private readonly uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * 根据文档类型创建对应的分割器
   *
   * @param docType - 文档类型（统一使用 DocType 枚举）
   * @returns 对应的分割器实例
   */
  create(docType: DocType): ISplitter {
    switch (docType) {
      case DocType.PDF:
        return new PDFSplitter(this.uploadsDir);

      case DocType.IMAGE:
        return new ImageSplitter(this.uploadsDir);

      case DocType.WORD:
        return new WordSplitter(this.uploadsDir);

      case DocType.POWERPOINT:
        return new PowerPointSplitter(this.uploadsDir);

      case DocType.EXCEL:
        return new ExcelSplitter(this.uploadsDir);

      default:
        const supportedTypes = Object.values(DocType).join(', ');
        throw new Error(
          `Unsupported document type: ${docType}. Supported types: ${supportedTypes}`
        );
    }
  }

  /**
   * 从文件名获取文档类型
   *
   * @param filename - 文件名
   * @returns 文档类型
   */
  static getDocType(filename: string): DocType {
    const ext = path.extname(filename);
    if (!ext || ext === '.') {
      throw new Error(`Filename has no extension: ${filename}`);
    }

    const normalizedExt = ext.slice(1).toLowerCase();

    // 检查是否为不支持的旧格式
    if (isLegacyFormat(normalizedExt)) {
      throw new Error(
        `Legacy format ".${normalizedExt}" is not supported. ` +
        `Please convert to Office Open XML format (.docx, .pptx, .xlsx) first.`
      );
    }

    const docType = EXTENSION_TO_DOCTYPE[normalizedExt];

    if (!docType) {
      const supportedExts = Object.keys(EXTENSION_TO_DOCTYPE).join(', ');
      throw new Error(
        `Unsupported file extension: ${ext}. Supported extensions: ${supportedExts}`
      );
    }

    return docType;
  }

  /**
   * 从文件名创建分割器（便捷方法）
   */
  createFromFilename(filename: string): ISplitter {
    const docType = SplitterFactory.getDocType(filename);
    return this.create(docType);
  }
}
```

### 7. WordSplitter 实现

```typescript
// src/core/infrastructure/adapters/split/WordSplitter.ts
import { promises as fs } from 'fs';
import mammoth from 'mammoth';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { ChunkedRenderer } from './ChunkedRenderer.js';
import { PageRangeParser } from './PageRangeParser.js';
import { PathValidator } from './PathValidator.js';

/**
 * 页面配置常量
 */
const PAGE_CONFIG = {
  /** A4 页面宽度（像素，96 DPI） */
  PAGE_WIDTH: 794,
  /** A4 页面高度（像素，96 DPI） */
  PAGE_HEIGHT: 1123,
  /** 渲染缩放因子 */
  DEVICE_SCALE_FACTOR: 2,
  /** 分段截图高度 */
  CHUNK_HEIGHT: 4000,
} as const;

/**
 * Word 文件分割器
 *
 * 支持：.docx, .dotx
 *
 * 技术方案：
 * - 使用 mammoth 解析 DOCX → HTML（保留样式、表格、图片）
 * - 使用 ChunkedRenderer 分段截图（内存优化）
 * - 按 A4 高度切分为页面
 *
 * 注意：pageRange 基于渲染后的页码，而非原文档的逻辑页码
 */
export class WordSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly windowPool: RenderWindowPool;
  private readonly tempFileManager: TempFileManager;
  private readonly chunkedRenderer: ChunkedRenderer;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.windowPool = RenderWindowPoolFactory.create({ maxSize: 2, acquireTimeout: 60000 });
    this.tempFileManager = new TempFileManager();
    this.chunkedRenderer = new ChunkedRenderer({
      chunkHeight: PAGE_CONFIG.CHUNK_HEIGHT,
      deviceScaleFactor: PAGE_CONFIG.DEVICE_SCALE_FACTOR,
      pageWidth: PAGE_CONFIG.PAGE_WIDTH,
      pageHeight: PAGE_CONFIG.PAGE_HEIGHT,
    });
  }

  /**
   * 分割 Word 文件为页面图片
   */
  async split(task: Task): Promise<SplitResult> {
    if (!task.id || !task.filename) {
      throw new Error('Task ID and filename are required');
    }

    const taskId = task.id;
    const filename = task.filename;

    // 安全验证
    const sourcePath = PathValidator.safePath(this.uploadsDir, taskId, filename);

    try {
      await fs.access(sourcePath);

      const taskDir = ImagePathUtil.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });

      // 使用 mammoth 解析 DOCX → HTML
      const result = await mammoth.convertToHtml(
        { path: sourcePath },
        {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
          ],
        }
      );

      const html = this.buildWordHtml(result.value);
      const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);

      // 获取渲染窗口
      const window = await this.windowPool.acquire(
        PAGE_CONFIG.PAGE_WIDTH,
        PAGE_CONFIG.CHUNK_HEIGHT
      );

      try {
        window.webContents.setZoomFactor(PAGE_CONFIG.DEVICE_SCALE_FACTOR);
        await this.loadAndWait(window, tempHtmlPath);

        // 获取文档总高度
        const totalHeight = await window.webContents.executeJavaScript(
          'document.body.scrollHeight'
        );

        // 分段截图
        const totalPages = await this.chunkedRenderer.renderToPages(
          window,
          totalHeight,
          (pageNum) => ImagePathUtil.getPath(taskId, pageNum)
        );

        // 构建页面信息
        let pages: PageInfo[] = Array.from({ length: totalPages }, (_, i) => ({
          page: i + 1,
          pageSource: i + 1,
          imagePath: ImagePathUtil.getPath(taskId, i + 1),
        }));

        // 应用页面范围过滤
        if (task.pageRange) {
          const parsed = PageRangeParser.parseNumeric(task.pageRange, totalPages);
          const keepPages = new Set(parsed.indices);

          // 删除不需要的页面文件
          for (const page of pages) {
            if (!keepPages.has(page.page)) {
              await fs.unlink(page.imagePath).catch(() => {});
            }
          }

          // 过滤并重新编号
          pages = pages
            .filter(p => keepPages.has(p.page))
            .map((p, idx) => ({ ...p, page: idx + 1 }));
        }

        return { pages, totalPages: pages.length };
      } finally {
        await this.windowPool.release(window);
        await this.tempFileManager.deleteFile(tempHtmlPath);
      }
    } catch (error) {
      throw this.wrapError(error, filename);
    } finally {
      await this.tempFileManager.cleanup();
    }
  }

  /**
   * 构建 Word 文档的完整 HTML
   */
  private buildWordHtml(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${PAGE_CONFIG.PAGE_WIDTH}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }
    body { padding: 60px 50px; }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: bold;
    }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; }
    h3 { font-size: 18px; }
    p { margin-bottom: 0.8em; text-align: justify; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    img { max-width: 100%; height: auto; }
    ul, ol { margin-left: 2em; margin-bottom: 1em; }
    li { margin-bottom: 0.3em; }
  </style>
</head>
<body>${content}</body>
</html>`;
  }

  /**
   * 加载 HTML 文件并等待渲染完成
   */
  private loadAndWait(window: Electron.BrowserWindow, htmlPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeoutId);
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Page load timeout'));
      }, 30000);

      window.webContents.once('did-finish-load', () => {
        cleanup();
        setTimeout(resolve, 200);
      });

      window.webContents.once('did-fail-load', (_event, errorCode, errorDesc) => {
        cleanup();
        reject(new Error(`Failed to load page: ${errorDesc} (${errorCode})`));
      });

      window.loadFile(htmlPath).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * 错误包装
   */
  private wrapError(error: unknown, filename: string): Error {
    const err = error as Error;
    const message = err.message.toLowerCase();

    if (message.includes('security error') || message.includes('path traversal')) {
      return err;
    }
    if (message.includes('enoent') || message.includes('no such file')) {
      return new Error(`Word file not found: ${filename}`);
    }
    if (message.includes('corrupt') || message.includes('invalid')) {
      return new Error(`Word file appears to be corrupted: ${filename}`);
    }

    return new Error(`Failed to process Word file ${filename}: ${err.message}`);
  }

  /**
   * 清理任务临时文件
   */
  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    await fs.rm(taskDir, { recursive: true, force: true }).catch(() => {});
    this.windowPool.destroy();
  }
}
```

### 8. PowerPointSplitter 实现

```typescript
// src/core/infrastructure/adapters/split/PowerPointSplitter.ts
import { promises as fs } from 'fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { PageRangeParser } from './PageRangeParser.js';
import { PathValidator } from './PathValidator.js';

/**
 * 幻灯片配置常量
 */
const SLIDE_CONFIG = {
  /** 幻灯片宽度 */
  WIDTH: 1280,
  /** 幻灯片高度（16:9） */
  HEIGHT: 720,
  /** 渲染缩放因子 */
  DEVICE_SCALE_FACTOR: 2,
} as const;

/**
 * 解析后的幻灯片数据
 */
interface SlideData {
  index: number;
  title?: string;
  content: string[];
  notes?: string;
  background?: string;
}

/**
 * PowerPoint 文件分割器
 *
 * 支持：.pptx, .potx
 *
 * 技术方案：
 * - 使用 JSZip 解压 PPTX 文件
 * - 解析 ppt/slides/slide*.xml 获取幻灯片内容
 * - 每张幻灯片独立渲染为 PNG
 */
export class PowerPointSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly windowPool: RenderWindowPool;
  private readonly tempFileManager: TempFileManager;
  private readonly xmlParser: XMLParser;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.windowPool = RenderWindowPoolFactory.create({ maxSize: 2, acquireTimeout: 60000 });
    this.tempFileManager = new TempFileManager();
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  /**
   * 分割 PowerPoint 文件为页面图片
   */
  async split(task: Task): Promise<SplitResult> {
    if (!task.id || !task.filename) {
      throw new Error('Task ID and filename are required');
    }

    const taskId = task.id;
    const filename = task.filename;

    const sourcePath = PathValidator.safePath(this.uploadsDir, taskId, filename);

    try {
      const fileBuffer = await fs.readFile(sourcePath);
      const zip = await JSZip.loadAsync(fileBuffer);

      const taskDir = ImagePathUtil.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });

      // 解析幻灯片
      const slides = await this.parseSlides(zip);

      if (slides.length === 0) {
        throw new Error('PowerPoint file contains no slides');
      }

      // 解析页面范围
      const parsed = PageRangeParser.parseNumeric(task.pageRange, slides.length);
      const selectedIndices = new Set(parsed.indices);

      // 渲染选中的幻灯片
      const pages: PageInfo[] = [];
      let outputPageNum = 1;

      for (const slide of slides) {
        if (!selectedIndices.has(slide.index)) {
          continue;
        }

        const slideHtml = this.buildSlideHtml(slide);
        const imagePath = ImagePathUtil.getPath(taskId, outputPageNum);

        await this.renderSlide(slideHtml, imagePath);

        pages.push({
          page: outputPageNum,
          pageSource: slide.index,
          imagePath,
        });

        outputPageNum++;
      }

      return { pages, totalPages: pages.length };
    } catch (error) {
      throw this.wrapError(error, filename);
    } finally {
      await this.tempFileManager.cleanup();
    }
  }

  /**
   * 从 PPTX 解析幻灯片数据
   */
  private async parseSlides(zip: JSZip): Promise<SlideData[]> {
    const slides: SlideData[] = [];

    // 获取所有幻灯片文件
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const content = await zip.file(slideFile)?.async('text');

      if (!content) continue;

      const parsed = this.xmlParser.parse(content);
      const slideData = this.extractSlideContent(parsed, i + 1);
      slides.push(slideData);
    }

    return slides;
  }

  /**
   * 从 XML 提取幻灯片内容
   */
  private extractSlideContent(parsed: any, index: number): SlideData {
    const texts: string[] = [];
    let title: string | undefined;

    // 递归提取所有文本
    const extractTexts = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;

      // 提取 <a:t> 标签内的文本
      if (obj['a:t']) {
        const text = typeof obj['a:t'] === 'string' ? obj['a:t'] : String(obj['a:t']);
        if (text.trim()) {
          texts.push(text.trim());
        }
      }

      // 递归处理数组和对象
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach(extractTexts);
        } else if (typeof obj[key] === 'object') {
          extractTexts(obj[key]);
        }
      }
    };

    extractTexts(parsed);

    // 第一个文本通常是标题
    if (texts.length > 0) {
      title = texts[0];
    }

    return {
      index,
      title,
      content: texts.slice(1),
    };
  }

  /**
   * 构建幻灯片 HTML
   */
  private buildSlideHtml(slide: SlideData): string {
    const titleHtml = slide.title
      ? `<h1 class="slide-title">${this.escapeHtml(slide.title)}</h1>`
      : '';

    const contentHtml = slide.content
      .map(text => `<p>${this.escapeHtml(text)}</p>`)
      .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${SLIDE_CONFIG.WIDTH}px;
      height: ${SLIDE_CONFIG.HEIGHT}px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
      overflow: hidden;
      padding: 50px 60px;
    }
    .slide-title {
      font-size: 42px;
      font-weight: 700;
      margin-bottom: 30px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    p {
      font-size: 24px;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .slide-number {
      position: absolute;
      bottom: 20px;
      right: 30px;
      font-size: 16px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  ${titleHtml}
  <div class="slide-content">${contentHtml}</div>
  <div class="slide-number">${slide.index}</div>
</body>
</html>`;
  }

  /**
   * 渲染幻灯片为图片
   */
  private async renderSlide(html: string, outputPath: string): Promise<void> {
    const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);
    const window = await this.windowPool.acquire(SLIDE_CONFIG.WIDTH, SLIDE_CONFIG.HEIGHT);

    try {
      window.webContents.setZoomFactor(SLIDE_CONFIG.DEVICE_SCALE_FACTOR);
      await this.loadAndWait(window, tempHtmlPath);

      const image = await window.webContents.capturePage({
        x: 0,
        y: 0,
        width: SLIDE_CONFIG.WIDTH,
        height: SLIDE_CONFIG.HEIGHT,
      });

      await fs.writeFile(outputPath, image.toPNG());
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
    }
  }

  /**
   * 加载 HTML 文件并等待渲染完成
   */
  private loadAndWait(window: Electron.BrowserWindow, htmlPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Page load timeout'));
      }, 30000);

      window.webContents.once('did-finish-load', () => {
        cleanup();
        setTimeout(resolve, 200);
      });

      window.webContents.once('did-fail-load', (_event, errorCode, errorDesc) => {
        cleanup();
        reject(new Error(`Failed to load page: ${errorDesc} (${errorCode})`));
      });

      window.loadFile(htmlPath).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private wrapError(error: unknown, filename: string): Error {
    const err = error as Error;
    const message = err.message.toLowerCase();

    if (message.includes('security error')) return err;
    if (message.includes('enoent')) {
      return new Error(`PowerPoint file not found: ${filename}`);
    }
    if (message.includes('invalid') || message.includes('corrupt')) {
      return new Error(`PowerPoint file appears to be corrupted: ${filename}`);
    }

    return new Error(`Failed to process PowerPoint file ${filename}: ${err.message}`);
  }

  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    await fs.rm(taskDir, { recursive: true, force: true }).catch(() => {});
    this.windowPool.destroy();
  }
}
```

### 9. ExcelSplitter 实现

```typescript
// src/core/infrastructure/adapters/split/ExcelSplitter.ts
import { promises as fs } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { ChunkedRenderer } from './ChunkedRenderer.js';
import { PageRangeParser } from './PageRangeParser.js';
import { PathValidator } from './PathValidator.js';
import { EncodingDetector } from './EncodingDetector.js';

/**
 * Excel 页面配置常量
 */
const EXCEL_CONFIG = {
  /** 最大渲染宽度 */
  MAX_WIDTH: 1600,
  /** 分页高度 */
  PAGE_HEIGHT: 1200,
  /** 分段截图高度 */
  CHUNK_HEIGHT: 4000,
  /** 每列默认宽度 */
  DEFAULT_COL_WIDTH: 100,
  /** 最小页面宽度 */
  MIN_WIDTH: 800,
  /** 渲染缩放因子 */
  DEVICE_SCALE_FACTOR: 2,
} as const;

/**
 * Sheet 数据
 */
interface SheetData {
  name: string;
  rows: string[][];
  colCount: number;
}

/**
 * Excel 文件分割器
 *
 * 支持：.xlsx, .xltx, .csv
 *
 * 技术方案：
 * - 使用 exceljs 解析 XLSX 文件
 * - 使用 papaparse 解析 CSV 文件（RFC 4180 兼容）
 * - 按 Sheet 分页 + 超长内容垂直分页
 */
export class ExcelSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly windowPool: RenderWindowPool;
  private readonly tempFileManager: TempFileManager;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.windowPool = RenderWindowPoolFactory.create({ maxSize: 2, acquireTimeout: 60000 });
    this.tempFileManager = new TempFileManager();
  }

  /**
   * 分割 Excel 文件为页面图片
   */
  async split(task: Task): Promise<SplitResult> {
    if (!task.id || !task.filename) {
      throw new Error('Task ID and filename are required');
    }

    const taskId = task.id;
    const filename = task.filename;

    const sourcePath = PathValidator.safePath(this.uploadsDir, taskId, filename);

    try {
      await fs.access(sourcePath);

      const taskDir = ImagePathUtil.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });

      const ext = path.extname(sourcePath).toLowerCase();
      const sheets = ext === '.csv'
        ? await this.parseCsv(sourcePath)
        : await this.parseExcel(sourcePath);

      if (sheets.length === 0) {
        throw new Error('Excel file contains no data');
      }

      // 解析 Sheet 范围（使用与页码相同的格式）
      const sheetNames = sheets.map(s => s.name);
      const sheetRange = PageRangeParser.parseSheetRange(task.pageRange, sheets.length);
      const selectedSheets = PageRangeParser.filterSheets(sheetNames, sheetRange);

      const pages: PageInfo[] = [];
      let pageIndex = 0;

      for (const sheetName of selectedSheets) {
        const sheet = sheets.find(s => s.name === sheetName)!;
        const sheetPages = await this.renderSheet(sheet, taskId, pageIndex);

        for (const page of sheetPages) {
          page.sheetName = sheetName;
        }

        pages.push(...sheetPages);
        pageIndex += sheetPages.length;
      }

      return { pages, totalPages: pages.length };
    } catch (error) {
      throw this.wrapError(error, filename);
    } finally {
      await this.tempFileManager.cleanup();
    }
  }

  /**
   * 解析 Excel 文件
   */
  private async parseExcel(filePath: string): Promise<SheetData[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets: SheetData[] = [];

    workbook.eachSheet((worksheet) => {
      const rows: string[][] = [];
      let maxCol = 0;

      worksheet.eachRow((row) => {
        const rowData: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          rowData[colNumber - 1] = cell.text || '';
          maxCol = Math.max(maxCol, colNumber);
        });
        rows.push(rowData);
      });

      // 填充空单元格
      for (const row of rows) {
        while (row.length < maxCol) {
          row.push('');
        }
      }

      if (rows.length > 0) {
        sheets.push({
          name: worksheet.name,
          rows,
          colCount: maxCol,
        });
      }
    });

    return sheets;
  }

  /**
   * 解析 CSV 文件（使用 papaparse）
   */
  private async parseCsv(filePath: string): Promise<SheetData[]> {
    const buffer = await fs.readFile(filePath);
    const content = EncodingDetector.toUtf8String(buffer);

    return new Promise((resolve, reject) => {
      Papa.parse(content, {
        complete: (results) => {
          const rows = results.data as string[][];

          // 移除尾部空行
          while (rows.length > 0 && rows[rows.length - 1].every(cell => !cell)) {
            rows.pop();
          }

          if (rows.length === 0) {
            resolve([]);
            return;
          }

          const colCount = Math.max(...rows.map(r => r.length));

          // 标准化列数
          for (const row of rows) {
            while (row.length < colCount) {
              row.push('');
            }
          }

          resolve([{
            name: 'CSV Data',
            rows,
            colCount,
          }]);
        },
        error: (error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        },
      });
    });
  }

  /**
   * 渲染单个 Sheet 为页面图片
   */
  private async renderSheet(
    sheet: SheetData,
    taskId: string,
    startPageIndex: number
  ): Promise<PageInfo[]> {
    const tableHtml = this.buildTableHtml(sheet.rows);
    const width = Math.min(
      Math.max(sheet.colCount * EXCEL_CONFIG.DEFAULT_COL_WIDTH, EXCEL_CONFIG.MIN_WIDTH),
      EXCEL_CONFIG.MAX_WIDTH
    );
    const fullHtml = this.buildExcelHtml(tableHtml, sheet.name, width);

    const tempHtmlPath = await this.tempFileManager.createHtmlFile(fullHtml);
    const window = await this.windowPool.acquire(width, EXCEL_CONFIG.CHUNK_HEIGHT);

    const chunkedRenderer = new ChunkedRenderer({
      chunkHeight: EXCEL_CONFIG.CHUNK_HEIGHT,
      deviceScaleFactor: EXCEL_CONFIG.DEVICE_SCALE_FACTOR,
      pageWidth: width,
      pageHeight: EXCEL_CONFIG.PAGE_HEIGHT,
    });

    try {
      window.webContents.setZoomFactor(EXCEL_CONFIG.DEVICE_SCALE_FACTOR);
      await this.loadAndWait(window, tempHtmlPath);

      const totalHeight = await window.webContents.executeJavaScript(
        'document.body.scrollHeight'
      );

      const pages: PageInfo[] = [];
      let pageNum = startPageIndex + 1;

      const totalPages = await chunkedRenderer.renderToPages(
        window,
        totalHeight,
        (num) => {
          const imagePath = ImagePathUtil.getPath(taskId, startPageIndex + num);
          pages.push({
            page: startPageIndex + num,
            pageSource: startPageIndex + num,
            imagePath,
          });
          return imagePath;
        }
      );

      return pages;
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
    }
  }

  /**
   * 构建 HTML 表格
   */
  private buildTableHtml(rows: string[][]): string {
    if (!rows.length) return '<table><tr><td>Empty</td></tr></table>';

    const rowsHtml = rows.map((row, idx) => {
      const cellTag = idx === 0 ? 'th' : 'td';
      const cellsHtml = row.map(cell =>
        `<${cellTag}>${this.escapeHtml(cell)}</${cellTag}>`
      ).join('');
      return `<tr>${cellsHtml}</tr>`;
    }).join('\n');

    return `<table>${rowsHtml}</table>`;
  }

  /**
   * 构建 Excel 表格的完整 HTML
   */
  private buildExcelHtml(tableHtml: string, sheetName: string, width: number): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
    }
    body { padding: 20px; }
    .sheet-name {
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #4CAF50;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: auto;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 300px;
    }
    th {
      background-color: #f5f5f5;
      font-weight: 600;
      color: #333;
    }
    tr:nth-child(even) { background-color: #fafafa; }
    tr:hover { background-color: #f0f7ff; }
  </style>
</head>
<body>
  <div class="sheet-name">${this.escapeHtml(sheetName)}</div>
  ${tableHtml}
</body>
</html>`;
  }

  private loadAndWait(window: Electron.BrowserWindow, htmlPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      const cleanup = () => clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Page load timeout'));
      }, 30000);

      window.webContents.once('did-finish-load', () => {
        cleanup();
        setTimeout(resolve, 200);
      });

      window.webContents.once('did-fail-load', (_event, errorCode, errorDesc) => {
        cleanup();
        reject(new Error(`Failed to load page: ${errorDesc} (${errorCode})`));
      });

      window.loadFile(htmlPath).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private wrapError(error: unknown, filename: string): Error {
    const err = error as Error;
    const message = err.message.toLowerCase();

    if (message.includes('security error')) return err;
    if (message.includes('enoent')) {
      return new Error(`Excel file not found: ${filename}`);
    }
    if (message.includes('invalid') || message.includes('corrupt')) {
      return new Error(`Excel file appears to be corrupted: ${filename}`);
    }

    return new Error(`Failed to process Excel file ${filename}: ${err.message}`);
  }

  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    await fs.rm(taskDir, { recursive: true, force: true }).catch(() => {});
    this.windowPool.destroy();
  }
}
```

### 10. 编码检测工具

```typescript
// src/core/infrastructure/adapters/split/EncodingDetector.ts
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';

/**
 * 支持的编码类型
 */
export type SupportedEncoding = 'utf-8' | 'gbk' | 'gb2312' | 'gb18030';

/**
 * 文件编码检测与转换
 *
 * 用于处理 CSV 文件的编码问题
 */
export class EncodingDetector {
  private static readonly SUPPORTED_ENCODINGS: SupportedEncoding[] = [
    'utf-8', 'gbk', 'gb2312', 'gb18030'
  ];

  /**
   * 检测 Buffer 的编码
   */
  static detect(buffer: Buffer): SupportedEncoding {
    const detected = chardet.detect(buffer);

    if (!detected) {
      return 'utf-8';
    }

    const normalized = detected.toLowerCase().replace('-', '');

    if (normalized.includes('utf8') || normalized.includes('ascii')) {
      return 'utf-8';
    }
    if (normalized.includes('gb18030')) {
      return 'gb18030';
    }
    if (normalized.includes('gbk') || normalized.includes('gb2312')) {
      return 'gbk';
    }

    return 'utf-8';
  }

  /**
   * 将 Buffer 转换为 UTF-8 字符串
   */
  static toUtf8String(buffer: Buffer): string {
    const encoding = this.detect(buffer);

    if (encoding === 'utf-8') {
      return buffer.toString('utf-8');
    }

    return iconv.decode(buffer, encoding);
  }
}
```

### 11. PageInfo 类型扩展

```typescript
// src/core/domain/split/ISplitter.ts

export interface PageInfo {
  /** 输出页码（连续编号，从 1 开始） */
  page: number;

  /** 原始页码/幻灯片编号/Sheet 索引（用于溯源） */
  pageSource: number;

  /** 图片文件路径 */
  imagePath: string;

  /** Sheet 名称（仅 Excel，可选） */
  sheetName?: string;
}

export interface SplitResult {
  pages: PageInfo[];
  totalPages: number;
}

export interface ISplitter {
  split(task: Task): Promise<SplitResult>;
  cleanup(taskId: string): Promise<void>;
}
```

### 12. Task 类型扩展

```typescript
// src/shared/types/index.ts

export interface Task {
  id: string;
  filename: string;
  // ... 其他字段

  /**
   * 页面范围（可选）
   *
   * 所有文档类型使用统一格式：
   * - PDF: "1-3,5" 表示原生页码
   * - Word: "1-3,5" 表示渲染后页码（注意：非原文档逻辑页码）
   * - PPT: "1,3,5-7" 表示幻灯片编号
   * - Excel: "1-3,5" 表示 Sheet 索引
   */
  pageRange?: string;
}
```

---

## 依赖变更

### 新增依赖

```json
{
  "dependencies": {
    "mammoth": "^1.8.0",
    "jszip": "^3.10.1",
    "fast-xml-parser": "^4.5.0",
    "exceljs": "^4.4.0",
    "papaparse": "^5.4.1",
    "chardet": "^2.1.0",
    "iconv-lite": "^0.6.3",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "@types/papaparse": "^5.3.15"
  }
}
```

### 依赖体积说明

| 依赖 | 用途 | 安装后大小 | 备注 |
|------|------|-----------|------|
| mammoth | Word 解析 | ~2 MB | 纯 JS，无原生依赖 |
| jszip | PPTX 解压 | ~200 KB | 纯 JS |
| fast-xml-parser | XML 解析 | ~300 KB | 纯 JS，高性能 |
| exceljs | Excel 解析 | ~5 MB | 支持样式、公式 |
| papaparse | CSV 解析 | ~50 KB | RFC 4180 兼容 |
| chardet | 编码检测 | ~162 KB | 纯 TypeScript |
| iconv-lite | 编码转换 | ~350 KB | 纯 JavaScript |
| sharp | 图片切分 | 7-12 MB | 包含 libvips |

**总计：约 15-20 MB**（相比原方案减少约 35 MB，因移除了 pdfjs-dist）

---

## 文件结构

```
src/
├── shared/
│   └── types/
│       ├── index.ts             # 修改：Task 增加 pageRange 字段
│       └── DocType.ts           # 新增：文档类型定义
│
└── core/
    ├── domain/
    │   └── split/
    │       └── ISplitter.ts     # 修改：PageInfo 增加 sheetName 字段
    │
    └── infrastructure/
        └── adapters/
            └── split/
                ├── SplitterFactory.ts        # 修改：支持 docType 分支
                ├── WordSplitter.ts           # 新增：Word 分割器 (mammoth)
                ├── PowerPointSplitter.ts     # 新增：PPT 分割器 (JSZip)
                ├── ExcelSplitter.ts          # 新增：Excel 分割器 (exceljs)
                ├── RenderWindowPoolFactory.ts # 新增：窗口池工厂
                ├── ChunkedRenderer.ts        # 新增：分段截图渲染器
                ├── TempFileManager.ts        # 新增：临时文件管理
                ├── PathValidator.ts          # 新增：路径安全验证
                ├── EncodingDetector.ts       # 新增：编码检测
                ├── PageRangeParser.ts        # 新增：页面范围解析
                ├── PDFSplitter.ts            # 保持不变
                └── ImageSplitter.ts          # 保持不变
```

---

## 页面范围支持

### 语义定义

| 文档类型 | 范围语义 | 示例 |
|----------|---------|------|
| **PDF** | 原生页码 | `1-3,5` = 第 1-3 页和第 5 页 |
| **Word** | **渲染后页码**（非原文档逻辑页码） | `1-3` = 渲染后的前 3 页截图 |
| **PowerPoint** | 幻灯片编号 | `1,3,5-7` = 第 1、3、5-7 张幻灯片 |
| **Excel** | Sheet 索引 | `1-3,5` = 第1、2、3、5 个Sheet |

### 使用示例

```typescript
// Word: 提取渲染后的第 1-3 页
// 注意：这是渲染后的页码，可能与原文档的逻辑页码不同
const wordTask: Task = {
  id: 'task-001',
  filename: 'report.docx',
  pageRange: '1-3',
};

// PPT: 提取第 1、3、5-7 张幻灯片
const pptTask: Task = {
  id: 'task-002',
  filename: 'presentation.pptx',
  pageRange: '1,3,5-7',
};

// Excel: 按索引提取 Sheet
const excelTask1: Task = {
  id: 'task-003',
  filename: 'data.xlsx',
  pageRange: '1-2',  // 第 1、2 个 Sheet
};

---

## 对比方案变化

### 架构变化

| 方面 | 原方案 | 新方案 |
|------|--------|--------|
| Splitter 数量 | 1 个 OfficeSplitter | 3 个独立 Splitter |
| Word 解析 | officeparser（API 不匹配） | mammoth（成熟稳定） |
| PPT 解析 | officeparser（无 slide 结构） | JSZip + XML 解析 |
| Excel 解析 | officeparser（无 sheet 结构） | exceljs（完整 API） |
| CSV 解析 | 简单 split（有缺陷） | papaparse（RFC 4180） |
| 窗口池 | 单例模式 | 工厂模式（独立实例） |
| 内存优化 | 全页截图（可能 OOM） | 分段截图（4000px） |

### 修复的问题

| 问题 | 原方案 | 新方案 |
|------|--------|--------|
| officeparser API 不匹配 | 假设存在 slides/sheets | 使用专门库 |
| 路径遍历漏洞 | 单次替换 `..` | 循环替换 + 严格验证 |
| CSV 复杂格式 | 简单 split | papaparse RFC 4180 |
| 大文档 OOM | 16000px 全页截图 | 4000px 分段截图 |
| 窗口池配置冲突 | 单例静默忽略配置 | 工厂模式独立实例 |
| 计时器泄漏 | 部分路径未清理 | 统一 cleanup 函数 |
| 窗口释放竞态 | 异步清理未等待 | await loadURL('about:blank') |
| Sheet 范围格式 | 名称/索引混合易歧义 | 仅索引，与其他类型统一 |

---

## 版本兼容性

- Node.js: ≥ 18.0.0
- Electron: ≥ 28.0.0
- mammoth: ≥ 1.8.0
- jszip: ≥ 3.10.0
- fast-xml-parser: ≥ 4.5.0
- exceljs: ≥ 4.4.0
- papaparse: ≥ 5.4.0
- chardet: ≥ 2.0.0
- iconv-lite: ≥ 0.6.3
- sharp: ≥ 0.33.0
