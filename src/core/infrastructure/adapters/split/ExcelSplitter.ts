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
import { PageRangeParser } from '../../../domain/split/PageRangeParser.js';
import { PathValidator } from './PathValidator.js';
import { EncodingDetector } from './EncodingDetector.js';

/**
 * Excel rendering configuration.
 */
const EXCEL_CONFIG = {
  /** Maximum render width */
  MAX_WIDTH: 1600,
  /** Page height for splitting */
  PAGE_HEIGHT: 1200,
  /** Chunk height for chunked rendering */
  CHUNK_HEIGHT: 4000,
  /** Default column width */
  DEFAULT_COL_WIDTH: 100,
  /** Minimum page width */
  MIN_WIDTH: 800,
  /** Device scale factor */
  DEVICE_SCALE_FACTOR: 2,
} as const;

/**
 * Sheet data structure.
 */
interface SheetData {
  name: string;
  rows: string[][];
  colCount: number;
}

/**
 * Excel file splitter.
 *
 * Supports: .xlsx, .xltx, .csv
 *
 * Technical approach:
 * - Uses exceljs to parse XLSX files
 * - Uses papaparse to parse CSV files (RFC 4180 compatible)
 * - Splits by sheets + vertical pagination for long content
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
   * Split an Excel file into page images.
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
      const sheets = ext === '.csv' ? await this.parseCsv(sourcePath) : await this.parseExcel(sourcePath);

      if (sheets.length === 0) {
        throw new Error('Excel file contains no data');
      }

      // Parse sheet range (uses same format as page numbers)
      const sheetRange = PageRangeParser.parse(task.page_range, sheets.length);
      const selectedIndices = new Set(sheetRange);

      const pages: PageInfo[] = [];
      let pageIndex = 0;

      for (let i = 0; i < sheets.length; i++) {
        if (!selectedIndices.has(i + 1)) {
          continue;
        }

        const sheet = sheets[i];
        const sheetPages = await this.renderSheet(sheet, taskId, pageIndex);

        for (const page of sheetPages) {
          page.sheetName = sheet.name;
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
   * Parse an Excel file.
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

      // Fill empty cells
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
   * Parse a CSV file using papaparse.
   */
  private async parseCsv(filePath: string): Promise<SheetData[]> {
    const buffer = await fs.readFile(filePath);
    const content = EncodingDetector.toUtf8String(buffer);

    return new Promise((resolve, reject) => {
      Papa.parse(content, {
        complete: (results) => {
          const rows = results.data as string[][];

          // Remove trailing empty rows
          while (rows.length > 0 && rows[rows.length - 1].every((cell) => !cell)) {
            rows.pop();
          }

          if (rows.length === 0) {
            resolve([]);
            return;
          }

          const colCount = Math.max(...rows.map((r) => r.length));

          // Normalize column count
          for (const row of rows) {
            while (row.length < colCount) {
              row.push('');
            }
          }

          resolve([
            {
              name: 'CSV Data',
              rows,
              colCount,
            },
          ]);
        },
        error: (error: Error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        },
      });
    });
  }

  /**
   * Render a sheet to page images.
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

      const totalHeight = await window.webContents.executeJavaScript('document.body.scrollHeight');

      const pages: PageInfo[] = [];

      await chunkedRenderer.renderToPages(window, totalHeight, (num) => {
        const imagePath = ImagePathUtil.getPath(taskId, startPageIndex + num);
        pages.push({
          page: startPageIndex + num,
          pageSource: startPageIndex + num,
          imagePath,
        });
        return imagePath;
      });

      return pages;
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
    }
  }

  /**
   * Build HTML table.
   */
  private buildTableHtml(rows: string[][]): string {
    if (!rows.length) return '<table><tr><td>Empty</td></tr></table>';

    const rowsHtml = rows
      .map((row, idx) => {
        const cellTag = idx === 0 ? 'th' : 'td';
        const cellsHtml = row
          .map((cell) => `<${cellTag}>${this.escapeHtml(cell)}</${cellTag}>`)
          .join('');
        return `<tr>${cellsHtml}</tr>`;
      })
      .join('\n');

    return `<table>${rowsHtml}</table>`;
  }

  /**
   * Build complete HTML for Excel table.
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
      const cleanup = () => clearTimeout(timeoutId);

      const timeoutId = setTimeout(() => {
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
