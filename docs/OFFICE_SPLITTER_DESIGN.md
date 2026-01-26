# Office 文件支持扩展设计方案

## 概述

本文档描述如何扩展 MarkPDFdown Desktop 以支持 Word、PowerPoint 和 Excel 文件的转换。

### 目标
- 支持 `word` 类型（.doc, .docx, .dot, .dotx）
- 支持 `powerpoint` 类型（.ppt, .pptx, .pot, .potx）
- 支持 `excel` 类型（.xls, .xlsx, .xlt, .xltx, .csv）
- 轻量级实现（包大小增加 < 4MB）
- 复用 Electron 渲染能力，无需额外浏览器进程

### 设计原则
- 统一使用 `docType`（文档类型）进行分支判断，而非文件扩展名
- 遵循现有清洁架构（ISplitter 接口 → SplitterFactory）
- 与现有 PDF/Image 分割器保持一致的 API

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

// 扩展名到文档类型的映射
export const EXTENSION_TO_DOCTYPE: Record<string, DocType> = {
  // PDF
  'pdf': DocType.PDF,
  
  // Image
  'jpg': DocType.IMAGE,
  'jpeg': DocType.IMAGE,
  'png': DocType.IMAGE,
  'webp': DocType.IMAGE,
  
  // Word
  'doc': DocType.WORD,
  'docx': DocType.WORD,
  'dot': DocType.WORD,
  'dotx': DocType.WORD,
  
  // PowerPoint
  'ppt': DocType.POWERPOINT,
  'pptx': DocType.POWERPOINT,
  'pot': DocType.POWERPOINT,
  'potx': DocType.POWERPOINT,
  
  // Excel
  'xls': DocType.EXCEL,
  'xlsx': DocType.EXCEL,
  'xlt': DocType.EXCEL,
  'xltx': DocType.EXCEL,
  'csv': DocType.EXCEL,
};
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
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────────┐ │
│ │ PDFSplitter  │ │ImageSplitter │ │ OfficeSplitter (NEW)             │ │
│ ├──────────────┤ ├──────────────┤ ├──────────────────────────────────┤ │
│ │ pdf-to-png   │ │ fs.copyFile  │ │ - mammoth.js (Word → HTML)       │ │
│ │ pdf-lib      │ │              │ │ - jszip (PPT → HTML)             │ │
│ └──────────────┘ └──────────────┘ │ - xlsx (Excel → HTML)            │ │
│                                   │ - BrowserWindow (HTML → PNG)     │ │
│                                   └──────────────────────────────────┘ │
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
│     上传文件      │───▶│  SplitterFactory   │───▶│   OfficeSplitter    │
│ .docx/.pptx/.xlsx│    │  getDocType()      │    │                     │
└──────────────────┘    │  create(docType)   │    └──────────┬──────────┘
                        └────────────────────┘               │
                                                             ▼
                   ┌────────────────────────────────────────────────────┐
                   │                    split(task)                      │
                   ├────────────────────────────────────────────────────┤
                   │  1. 根据 docType 选择解析策略                        │
                   │     - word: mammoth.js 转 HTML                      │
                   │     - powerpoint: jszip 解析幻灯片 XML              │
                   │     - excel: xlsx 库解析工作表                      │
                   │                                                     │
                   │  2. 渲染 HTML 为图片                                 │
                   │     - 创建隐藏 BrowserWindow                        │
                   │     - loadURL (data:text/html)                      │
                   │     - capturePage() 截图                            │
                   │                                                     │
                   │  3. 分页策略                                         │
                   │     - word: 按内容高度分页（A4 比例）                 │
                   │     - powerpoint: 每张幻灯片一页                     │
                   │     - excel: 按 Sheet 分页 + 智能尺寸计算            │
                   └────────────────────────────────────────────────────┘
                                        │
                                        ▼
                   ┌────────────────────────────────────────────────────┐
                   │              SplitResult                            │
                   │  { pages: PageInfo[], totalPages: number }         │
                   └────────────────────────────────────────────────────┘
```

---

## 详细设计

### 1. SplitterFactory 改造

```typescript
// src/core/infrastructure/adapters/split/SplitterFactory.ts
import path from 'path';
import { ISplitter } from '../../../domain/split/ISplitter.js';
import { PDFSplitter } from './PDFSplitter.js';
import { ImageSplitter } from './ImageSplitter.js';
import { OfficeSplitter } from './OfficeSplitter.js';
import { DocType, EXTENSION_TO_DOCTYPE } from '../../../../shared/types/DocType.js';

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
      case DocType.POWERPOINT:
      case DocType.EXCEL:
        return new OfficeSplitter(this.uploadsDir, docType);

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

### 2. OfficeSplitter 实现

```typescript
// src/core/infrastructure/adapters/split/OfficeSplitter.ts
import { promises as fs } from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { BrowserWindow } from 'electron';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { DocType } from '../../../../shared/types/DocType.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { WORKER_CONFIG } from '../../config/worker.config.js';

/**
 * 页面配置常量
 */
const PAGE_CONFIG = {
  /** A4 页面宽度（像素，96 DPI） */
  PAGE_WIDTH: 794,
  /** A4 页面高度（像素，96 DPI） */
  PAGE_HEIGHT: 1123,
  /** PPT 幻灯片宽度 */
  SLIDE_WIDTH: 1280,
  /** PPT 幻灯片高度（16:9） */
  SLIDE_HEIGHT: 720,
  /** 渲染缩放因子 */
  DEVICE_SCALE_FACTOR: 2,
};

/**
 * Excel 页面配置常量
 */
const EXCEL_CONFIG = {
  /** 最大渲染宽度 */
  MAX_WIDTH: 1600,
  /** 最大渲染高度（单次截图） */
  MAX_HEIGHT: 2000,
  /** 每列默认宽度 */
  DEFAULT_COL_WIDTH: 100,
  /** 最小列宽 */
  MIN_COL_WIDTH: 60,
  /** 行高 */
  ROW_HEIGHT: 28,
  /** 最小页面宽度 */
  MIN_WIDTH: 800,
};

/**
 * Office 文件分割器
 * 
 * 支持：
 * - Word 文档：.doc, .docx, .dot, .dotx
 * - PowerPoint 演示文稿：.ppt, .pptx, .pot, .potx
 * - Excel 电子表格：.xls, .xlsx, .xlt, .xltx, .csv
 * 
 * 技术方案：
 * - 使用 mammoth.js 将 Word 文档转换为 HTML
 * - 使用 jszip 解析 PowerPoint 文件
 * - 使用 xlsx (SheetJS) 解析 Excel 文件
 * - 复用 Electron BrowserWindow 进行 HTML → PNG 渲染
 */
export class OfficeSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly docType: DocType;

  constructor(uploadsDir: string, docType: DocType) {
    this.uploadsDir = uploadsDir;
    this.docType = docType;
  }

  /**
   * 分割 Office 文件为页面图片
   */
  async split(task: Task): Promise<SplitResult> {
    if (!task.id) {
      throw new Error('Task ID is required');
    }
    if (!task.filename) {
      throw new Error('Task filename is required');
    }

    const taskId = task.id;
    const filename = task.filename;
    const sourcePath = path.join(this.uploadsDir, taskId, filename);

    try {
      // 确保源文件存在
      await fs.access(sourcePath);

      // 确保输出目录存在
      const taskDir = ImagePathUtil.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });

      // 根据文档类型选择处理策略
      let pages: PageInfo[];
      
      switch (this.docType) {
        case DocType.WORD:
          pages = await this.splitWord(sourcePath, taskId);
          break;
        case DocType.POWERPOINT:
          pages = await this.splitPowerPoint(sourcePath, taskId);
          break;
        case DocType.EXCEL:
          pages = await this.splitExcel(sourcePath, taskId);
          break;
        default:
          throw new Error(`OfficeSplitter does not support docType: ${this.docType}`);
      }

      return {
        pages,
        totalPages: pages.length,
      };
    } catch (error) {
      throw this.wrapError(error, taskId, filename);
    }
  }

  /**
   * 分割 Word 文档
   */
  private async splitWord(sourcePath: string, taskId: string): Promise<PageInfo[]> {
    // 使用 mammoth.js 将 docx 转换为 HTML
    const result = await mammoth.convertToHtml({ path: sourcePath });
    const html = result.value;

    // 如果有警告，记录日志
    if (result.messages.length > 0) {
      console.warn(`[OfficeSplitter] Word conversion warnings:`, result.messages);
    }

    // 构建完整 HTML 页面
    const fullHtml = this.buildWordHtml(html);

    // 渲染为图片（按页分割）
    return this.renderHtmlToPages(fullHtml, taskId, DocType.WORD);
  }

  /**
   * 分割 PowerPoint 演示文稿
   */
  private async splitPowerPoint(sourcePath: string, taskId: string): Promise<PageInfo[]> {
    // 解析 PPTX 文件
    const slides = await this.parsePptx(sourcePath);

    const pages: PageInfo[] = [];

    // 每张幻灯片单独渲染
    for (let i = 0; i < slides.length; i++) {
      const slideHtml = this.buildSlideHtml(slides[i], i + 1);
      const pageImages = await this.renderHtmlToPages(slideHtml, taskId, DocType.POWERPOINT, i + 1);
      pages.push(...pageImages);
    }

    return pages;
  }

  /**
   * 分割 Excel 电子表格
   * 
   * 策略：按 Sheet 分页 + 智能尺寸计算
   * - 每个 Sheet 独立渲染
   * - 根据列数动态计算宽度
   * - 超长内容自动垂直分页
   */
  private async splitExcel(sourcePath: string, taskId: string): Promise<PageInfo[]> {
    const XLSX = await import('xlsx');
    
    // 读取 Excel 文件
    const workbook = XLSX.read(await fs.readFile(sourcePath), { type: 'buffer' });
    
    if (workbook.SheetNames.length === 0) {
      throw new Error('Excel file contains no sheets');
    }

    const pages: PageInfo[] = [];
    let pageIndex = 0;

    // 遍历每个 Sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // 获取数据范围
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const colCount = range.e.c - range.s.c + 1;
      const rowCount = range.e.r - range.s.r + 1;

      // 计算渲染尺寸
      const dimensions = this.calculateExcelDimensions(colCount, rowCount);

      // 转换为 HTML 表格
      const htmlTable = XLSX.utils.sheet_to_html(worksheet, {
        editable: false,
        header: '',
        footer: '',
      });

      // 构建完整 HTML
      const fullHtml = this.buildExcelHtml(htmlTable, sheetName, dimensions.width);

      // 渲染为图片（可能需要垂直分页）
      const sheetPages = await this.renderExcelToPages(
        fullHtml,
        taskId,
        pageIndex,
        dimensions
      );

      pages.push(...sheetPages);
      pageIndex += sheetPages.length;
    }

    return pages;
  }

  /**
   * 计算 Excel Sheet 的渲染尺寸
   */
  private calculateExcelDimensions(
    colCount: number,
    rowCount: number
  ): { width: number; height: number; pages: number } {
    // 计算内容宽度
    const contentWidth = Math.min(
      colCount * EXCEL_CONFIG.DEFAULT_COL_WIDTH,
      EXCEL_CONFIG.MAX_WIDTH
    );
    
    // 计算内容高度
    const contentHeight = rowCount * EXCEL_CONFIG.ROW_HEIGHT;
    
    // 计算需要多少页
    const pages = Math.ceil(contentHeight / EXCEL_CONFIG.MAX_HEIGHT);
    
    return {
      width: Math.max(contentWidth, EXCEL_CONFIG.MIN_WIDTH),
      height: Math.min(contentHeight, EXCEL_CONFIG.MAX_HEIGHT),
      pages,
    };
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: ${width}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
    }
    body {
      padding: 20px;
    }
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
    tr:nth-child(even) {
      background-color: #fafafa;
    }
    tr:hover {
      background-color: #f0f7ff;
    }
    /* 首行样式（通常是标题行） */
    tr:first-child td,
    tr:first-child th {
      background-color: #e8f5e9;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="sheet-name">📊 ${this.escapeHtml(sheetName)}</div>
  ${tableHtml}
</body>
</html>`;
  }

  /**
   * 渲染 Excel HTML 为页面图片
   * 
   * 处理超长表格的垂直分页
   */
  private async renderExcelToPages(
    html: string,
    taskId: string,
    startPageIndex: number,
    dimensions: { width: number; height: number; pages: number }
  ): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];

    // 创建隐藏的渲染窗口
    const renderWindow = new BrowserWindow({
      show: false,
      width: dimensions.width,
      height: dimensions.height,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });

    try {
      renderWindow.webContents.setZoomFactor(PAGE_CONFIG.DEVICE_SCALE_FACTOR);

      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await renderWindow.loadURL(dataUrl);
      await this.waitForRender(renderWindow);

      // 获取实际内容高度
      const totalHeight = await renderWindow.webContents.executeJavaScript(
        'document.body.scrollHeight'
      );

      const pageHeight = EXCEL_CONFIG.MAX_HEIGHT;
      const totalPages = Math.ceil(totalHeight / pageHeight);

      for (let i = 0; i < totalPages; i++) {
        const pageNum = startPageIndex + i + 1;
        const imagePath = ImagePathUtil.getPath(taskId, pageNum);

        // 滚动到对应位置
        await renderWindow.webContents.executeJavaScript(
          `window.scrollTo(0, ${i * pageHeight})`
        );

        await this.sleep(100);

        // 截图
        const captureHeight = Math.min(pageHeight, totalHeight - i * pageHeight);
        const image = await renderWindow.webContents.capturePage({
          x: 0,
          y: 0,
          width: dimensions.width,
          height: captureHeight,
        });

        await fs.writeFile(imagePath, image.toPNG());

        pages.push({
          page: pageNum,
          pageSource: pageNum,
          imagePath,
        });
      }

      return pages;
    } finally {
      renderWindow.destroy();
    }
  }

  /**
   * 解析 PPTX 文件
   * 
   * PPTX 是 ZIP 格式，包含 XML 文件
   */
  private async parsePptx(sourcePath: string): Promise<string[]> {
    const JSZip = (await import('jszip')).default;
    
    const data = await fs.readFile(sourcePath);
    const zip = await JSZip.loadAsync(data);
    
    const slides: string[] = [];
    
    // PPTX 结构: ppt/slides/slide1.xml, slide2.xml, ...
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    for (const slideFile of slideFiles) {
      const content = await zip.file(slideFile)?.async('string');
      if (content) {
        // 从 XML 提取文本内容
        const slideHtml = this.pptxXmlToHtml(content);
        slides.push(slideHtml);
      }
    }

    if (slides.length === 0) {
      throw new Error('PowerPoint file contains no slides');
    }

    return slides;
  }

  /**
   * 将 PPTX XML 转换为 HTML
   */
  private pptxXmlToHtml(xml: string): string {
    // 提取文本内容（<a:t> 标签）
    const textRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    const texts: string[] = [];
    let match;
    
    while ((match = textRegex.exec(xml)) !== null) {
      if (match[1].trim()) {
        texts.push(match[1]);
      }
    }

    // 构建简单 HTML（保持段落结构）
    return texts.map(text => `<p>${this.escapeHtml(text)}</p>`).join('\n');
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: ${PAGE_CONFIG.PAGE_WIDTH}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }
    body {
      padding: 60px 50px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: bold;
    }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; }
    h3 { font-size: 18px; }
    p {
      margin-bottom: 0.8em;
      text-align: justify;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f5f5f5;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    ul, ol {
      margin-left: 2em;
      margin-bottom: 1em;
    }
    li {
      margin-bottom: 0.3em;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
  }

  /**
   * 构建单张幻灯片的 HTML
   */
  private buildSlideHtml(content: string, slideNumber: number): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: ${PAGE_CONFIG.SLIDE_WIDTH}px;
      height: ${PAGE_CONFIG.SLIDE_HEIGHT}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      overflow: hidden;
    }
    body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 40px 60px;
    }
    .slide-content {
      width: 100%;
      text-align: center;
    }
    h1, h2 {
      margin-bottom: 0.5em;
      color: #333;
    }
    h1 { font-size: 36px; }
    h2 { font-size: 28px; }
    p {
      font-size: 18px;
      line-height: 1.8;
      color: #555;
      margin-bottom: 0.5em;
    }
    .slide-number {
      position: absolute;
      bottom: 20px;
      right: 30px;
      font-size: 14px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="slide-content">
    ${content}
  </div>
  <div class="slide-number">${slideNumber}</div>
</body>
</html>`;
  }

  /**
   * 将 HTML 渲染为页面图片
   * 
   * 利用 Electron 的 BrowserWindow 进行渲染：
   * 1. 创建隐藏的 BrowserWindow
   * 2. 加载 HTML 内容
   * 3. 使用 capturePage() 截图
   * 4. 保存为 PNG 文件
   */
  private async renderHtmlToPages(
    html: string,
    taskId: string,
    docType: DocType,
    slideNumber?: number
  ): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];

    // 根据文档类型确定页面尺寸
    const isSlide = docType === DocType.POWERPOINT;
    const pageWidth = isSlide ? PAGE_CONFIG.SLIDE_WIDTH : PAGE_CONFIG.PAGE_WIDTH;
    const pageHeight = isSlide ? PAGE_CONFIG.SLIDE_HEIGHT : PAGE_CONFIG.PAGE_HEIGHT;

    // 创建隐藏的渲染窗口
    const renderWindow = new BrowserWindow({
      show: false,
      width: pageWidth,
      height: pageHeight,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });

    try {
      // 设置设备缩放因子以获得高清图片
      renderWindow.webContents.setZoomFactor(PAGE_CONFIG.DEVICE_SCALE_FACTOR);

      // 加载 HTML 内容
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await renderWindow.loadURL(dataUrl);

      // 等待页面渲染完成
      await this.waitForRender(renderWindow);

      if (isSlide) {
        // PPT：每张幻灯片单独截图
        const pageNum = slideNumber || 1;
        const imagePath = ImagePathUtil.getPath(taskId, pageNum);
        
        const image = await renderWindow.webContents.capturePage();
        await fs.writeFile(imagePath, image.toPNG());
        
        pages.push({
          page: pageNum,
          pageSource: pageNum,
          imagePath,
        });
      } else {
        // Word：获取文档总高度，按页分割
        const totalHeight = await renderWindow.webContents.executeJavaScript(
          'document.body.scrollHeight'
        );

        const totalPages = Math.ceil(totalHeight / pageHeight);

        for (let i = 0; i < totalPages; i++) {
          const pageNum = i + 1;
          const imagePath = ImagePathUtil.getPath(taskId, pageNum);

          // 滚动到对应页面位置
          await renderWindow.webContents.executeJavaScript(
            `window.scrollTo(0, ${i * pageHeight})`
          );

          // 等待滚动完成
          await this.sleep(100);

          // 截图
          const image = await renderWindow.webContents.capturePage({
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
          });

          await fs.writeFile(imagePath, image.toPNG());

          pages.push({
            page: pageNum,
            pageSource: pageNum,
            imagePath,
          });
        }
      }

      return pages;
    } finally {
      // 确保窗口被关闭
      renderWindow.destroy();
    }
  }

  /**
   * 等待页面渲染完成
   */
  private async waitForRender(window: BrowserWindow): Promise<void> {
    return new Promise((resolve) => {
      window.webContents.on('did-finish-load', () => {
        // 额外等待一小段时间确保样式渲染完成
        setTimeout(resolve, 200);
      });
    });
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 错误包装
   */
  private wrapError(error: unknown, _taskId: string, filename: string): Error {
    const err = error as Error;
    const message = err.message.toLowerCase();

    if (message.includes('enoent') || message.includes('no such file')) {
      return new Error(
        `Office file not found: ${filename}. The file may have been moved or deleted.`
      );
    }

    if (message.includes('corrupt') || message.includes('invalid')) {
      return new Error(
        `Office file appears to be corrupted: ${filename}. Please check the file.`
      );
    }

    if (message.includes('password') || message.includes('encrypted')) {
      return new Error(
        `Cannot process password-protected file: ${filename}. Please provide an unencrypted version.`
      );
    }

    return new Error(`Failed to process Office file ${filename}: ${err.message}`);
  }

  /**
   * 清理任务临时文件
   */
  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);

    try {
      await fs.rm(taskDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[OfficeSplitter] Failed to cleanup task ${taskId}:`, error);
    }
  }

  /**
   * 延时函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## 依赖变更

### 新增依赖

```json
{
  "dependencies": {
    "mammoth": "^1.6.0",
    "xlsx": "^0.18.5"
  }
}
```

| 依赖 | 用途 | 大小 |
|------|------|------|
| mammoth | Word 文档转 HTML | ~1.5MB |
| xlsx (SheetJS) | Excel 文件解析 | ~2MB |
| jszip | 解析 PPTX（已存在于项目中） | - |

### 包大小影响

- **新增依赖大小**：约 3.5MB
- **无额外运行时依赖**：复用 Electron 内置能力

---

## 文件结构

```
src/
├── shared/
│   └── types/
│       └── DocType.ts           # 新增：文档类型定义
│
└── core/
    └── infrastructure/
        └── adapters/
            └── split/
                ├── SplitterFactory.ts   # 修改：支持 docType 分支
                ├── OfficeSplitter.ts    # 新增：Office 文件分割器
                ├── PDFSplitter.ts       # 保持不变
                └── ImageSplitter.ts     # 保持不变
```

---

## 对比现有实现

| 特性 | PDFSplitter | ImageSplitter | OfficeSplitter |
|------|-------------|---------------|----------------|
| 输入格式 | PDF | JPG/PNG/WebP | DOCX/PPTX/XLSX |
| 转换方式 | pdf-to-png | fs.copyFile | HTML → capturePage |
| 分页策略 | 原生页面 | 单页 | Word 按高度 / PPT 每幻灯片 / Excel 按 Sheet |
| 页码支持 | 支持 page_range | 忽略 | 暂不支持 |
| 重试机制 | 3 次重试 | 无 | 无（可扩展） |

---

## Excel 分页策略详解

### 挑战

| 问题 | 说明 |
|------|------|
| **列数不固定** | 表格可能有 3 列或 100 列，宽度难以预设 |
| **行数不固定** | 可能几行或数万行 |
| **多 Sheet** | 一个 Excel 可能有多个工作表 |
| **合并单元格** | 复杂布局影响渲染 |

### 采用方案：按 Sheet 分页 + 智能尺寸计算

```
┌──────────────┐    ┌─────────────────┐    ┌────────────────────┐
│  .xlsx 文件  │───▶│   xlsx 库解析   │───▶│  获取 Sheet 列表   │
└──────────────┘    └─────────────────┘    └─────────┬──────────┘
                                                     │
                    ┌────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    遍历每个 Sheet                                │
├─────────────────────────────────────────────────────────────────┤
│  1. 获取数据范围（行数、列数）                                     │
│  2. 计算渲染尺寸                                                  │
│     - 宽度 = min(列数 × 100px, 1600px)                          │
│     - 高度 = min(行数 × 28px, 2000px)                           │
│  3. 转换为 HTML 表格（使用 sheet_to_html）                        │
│  4. 设置 BrowserWindow 尺寸                                       │
│  5. 分页截图（如果内容超高）                                       │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  输出: [Sheet1-Page1.png, Sheet1-Page2.png, Sheet2-Page1.png]   │
└─────────────────────────────────────────────────────────────────┘
```

### 尺寸计算公式

```typescript
// 宽度计算
width = Math.max(
  Math.min(colCount * 100, 1600),  // 上限 1600px
  800                               // 下限 800px
)

// 高度计算（单次截图）
height = Math.min(rowCount * 28, 2000)  // 上限 2000px

// 总页数
pages = Math.ceil(totalContentHeight / 2000)
```

---

## 使用示例

```typescript
// 使用文档类型创建分割器
const factory = new SplitterFactory(uploadsDir);

// 方式 1：直接使用 DocType
const wordSplitter = factory.create(DocType.WORD);
const pptSplitter = factory.create(DocType.POWERPOINT);
const excelSplitter = factory.create(DocType.EXCEL);

// 方式 2：从文件名自动推断
const splitter = factory.createFromFilename('report.xlsx');
const result = await splitter.split(task);

// 处理结果
console.log(`Generated ${result.totalPages} pages`);
result.pages.forEach(page => {
  console.log(`Page ${page.page}: ${page.imagePath}`);
});
```

---

## 后续扩展

### 可选优化

1. **旧格式支持**：.doc、.ppt、.xls（非 XML 格式）需要额外库支持
2. **图片提取**：从文档中提取嵌入图片
3. **样式还原**：更精确的 CSS 样式映射
4. **页码范围**：支持 page_range 参数
5. **Excel 图表**：提取并渲染 Excel 图表

### 性能优化

1. **窗口复用**：多任务时复用 BrowserWindow
2. **并行渲染**：多页/多 Sheet 同时渲染
3. **缓存机制**：相同文档的转换缓存
4. **流式处理**：大文件分块读取

---

## 版本兼容性

- Node.js: ≥ 18.0.0
- Electron: ≥ 28.0.0
- mammoth: ≥ 1.6.0
- xlsx: ≥ 0.18.5
