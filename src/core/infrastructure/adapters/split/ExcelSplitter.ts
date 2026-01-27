import { promises as fs } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { pdfToPng } from 'pdf-to-png-converter';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { PageRangeParser } from '../../../domain/split/PageRangeParser.js';
import { PathValidator } from './PathValidator.js';
import { EncodingDetector } from './EncodingDetector.js';
import { WORKER_CONFIG } from '../../config/worker.config.js';

/**
 * Excel rendering configuration.
 */
const EXCEL_CONFIG = {
  /** Default render width for window */
  RENDER_WIDTH: 1200,
  /** Default render height for window */
  RENDER_HEIGHT: 800,
  /** Default column width in pixels */
  DEFAULT_COL_WIDTH: 100,
  /** Excel column width multiplier (Excel units to pixels) */
  COLUMN_WIDTH_MULTIPLIER: 8,
  /** Render timeout in milliseconds */
  RENDER_TIMEOUT: 60000,
} as const;

/**
 * Cell style information.
 */
interface CellStyle {
  backgroundColor?: string;
  fontColor?: string;
  fontWeight?: 'bold' | 'normal';
  fontStyle?: 'italic' | 'normal';
  fontSize?: number;
  textDecoration?: string;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
}

/**
 * Cell data with style and merge info.
 */
interface CellData {
  value: string;
  style: CellStyle;
  rowSpan?: number;
  colSpan?: number;
  isMerged?: boolean;
  isHidden?: boolean;
}

/**
 * Sheet data structure with enhanced style support.
 */
interface SheetData {
  name: string;
  rows: CellData[][];
  colCount: number;
  colWidths: number[];
}

/**
 * Merged cell range.
 */
interface MergeRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/**
 * Excel file splitter.
 *
 * Supports: .xlsx, .xltx, .csv
 *
 * Technical approach:
 * - Uses exceljs to parse XLSX files with full style support
 * - Preserves cell styles: background colors, fonts, borders
 * - Handles merged cells with colspan/rowspan
 * - Uses papaparse to parse CSV files (RFC 4180 compatible)
 * - Converts HTML to PDF using Electron's printToPDF
 * - Converts PDF to images using pdf-to-png-converter
 * - This approach preserves complete content without truncation
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
      let pageIndex = 1;

      for (let i = 0; i < sheets.length; i++) {
        if (!selectedIndices.has(i + 1)) {
          continue;
        }

        const sheet = sheets[i];
        const sheetPages = await this.renderSheetWithPrintToPDF(sheet, taskId, pageIndex);

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
   * Parse an Excel file with full style support.
   */
  private async parseExcel(filePath: string): Promise<SheetData[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets: SheetData[] = [];

    workbook.eachSheet((worksheet) => {
      const mergeMap = this.getMergedCellsMap(worksheet);
      const colWidths = this.getColumnWidths(worksheet);
      const rows: CellData[][] = [];
      let maxCol = 0;

      worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const rowData: CellData[] = [];

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const mergeKey = `${rowNumber},${colNumber}`;
          const mergeInfo = mergeMap.get(mergeKey);

          // Check if this cell is hidden by a merge
          if (mergeInfo?.isHidden) {
            rowData[colNumber - 1] = {
              value: '',
              style: {},
              isHidden: true,
            };
          } else {
            const style = this.extractCellStyle(cell);
            rowData[colNumber - 1] = {
              value: cell.text || '',
              style,
              rowSpan: mergeInfo?.rowSpan,
              colSpan: mergeInfo?.colSpan,
              isMerged: mergeInfo?.isMaster,
            };
          }

          maxCol = Math.max(maxCol, colNumber);
        });

        rows[rowNumber - 1] = rowData;
      });

      // Fill empty rows and cells
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i]) {
          rows[i] = [];
        }
        while (rows[i].length < maxCol) {
          rows[i].push({ value: '', style: {} });
        }
      }

      // Remove trailing empty rows
      while (rows.length > 0 && rows[rows.length - 1].every((cell) => !cell.value)) {
        rows.pop();
      }

      if (rows.length > 0) {
        sheets.push({
          name: worksheet.name,
          rows,
          colCount: maxCol,
          colWidths: colWidths.slice(0, maxCol),
        });
      }
    });

    return sheets;
  }

  /**
   * Get column widths from worksheet.
   */
  private getColumnWidths(worksheet: ExcelJS.Worksheet): number[] {
    const widths: number[] = [];
    const colCount = worksheet.columnCount || 26;

    for (let i = 1; i <= colCount; i++) {
      const col = worksheet.getColumn(i);
      const width = col.width || 10; // Default Excel column width
      widths.push(Math.round(width * EXCEL_CONFIG.COLUMN_WIDTH_MULTIPLIER));
    }

    return widths;
  }

  /**
   * Build a map of merged cells for quick lookup.
   */
  private getMergedCellsMap(
    worksheet: ExcelJS.Worksheet
  ): Map<string, { rowSpan?: number; colSpan?: number; isMaster?: boolean; isHidden?: boolean }> {
    const map = new Map<
      string,
      { rowSpan?: number; colSpan?: number; isMaster?: boolean; isHidden?: boolean }
    >();

    // Access merged cells through worksheet model
    const merges = (worksheet as unknown as { model?: { merges?: string[] } }).model?.merges || [];

    for (const mergeRange of merges) {
      const range = this.parseMergeRange(mergeRange);
      if (!range) continue;

      const rowSpan = range.endRow - range.startRow + 1;
      const colSpan = range.endCol - range.startCol + 1;

      // Mark master cell
      map.set(`${range.startRow},${range.startCol}`, {
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        colSpan: colSpan > 1 ? colSpan : undefined,
        isMaster: true,
      });

      // Mark hidden cells
      for (let r = range.startRow; r <= range.endRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          if (r !== range.startRow || c !== range.startCol) {
            map.set(`${r},${c}`, { isHidden: true });
          }
        }
      }
    }

    return map;
  }

  /**
   * Parse a merge range string (e.g., "A1:C3") to row/col numbers.
   */
  private parseMergeRange(rangeStr: string): MergeRange | null {
    const match = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) return null;

    const colToNum = (col: string): number => {
      let num = 0;
      for (let i = 0; i < col.length; i++) {
        num = num * 26 + (col.charCodeAt(i) - 64);
      }
      return num;
    };

    return {
      startCol: colToNum(match[1]),
      startRow: parseInt(match[2]),
      endCol: colToNum(match[3]),
      endRow: parseInt(match[4]),
    };
  }

  /**
   * Extract cell style from an ExcelJS cell.
   */
  private extractCellStyle(cell: ExcelJS.Cell): CellStyle {
    const style: CellStyle = {};

    // Background color
    const fill = cell.style.fill;
    if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
      const fgColor = fill.fgColor;
      if (fgColor) {
        const color = this.excelColorToHex(fgColor);
        if (color && color !== '#FFFFFF' && color !== '#ffffff') {
          style.backgroundColor = color;
        }
      }
    }

    // Font styles
    const font = cell.style.font;
    if (font) {
      if (font.bold) {
        style.fontWeight = 'bold';
      }
      if (font.italic) {
        style.fontStyle = 'italic';
      }
      if (font.size) {
        style.fontSize = font.size;
      }
      if (font.color) {
        const color = this.excelColorToHex(font.color);
        if (color && color !== '#000000') {
          style.fontColor = color;
        }
      }
      if (font.underline) {
        style.textDecoration = 'underline';
      }
      if (font.strike) {
        style.textDecoration = style.textDecoration
          ? `${style.textDecoration} line-through`
          : 'line-through';
      }
    }

    // Alignment
    const alignment = cell.style.alignment;
    if (alignment) {
      if (alignment.horizontal) {
        style.textAlign = alignment.horizontal as 'left' | 'center' | 'right';
      }
      if (alignment.vertical) {
        style.verticalAlign = alignment.vertical as 'top' | 'middle' | 'bottom';
      }
    }

    // Borders
    const border = cell.style.border;
    if (border) {
      if (border.top) {
        style.borderTop = this.borderToCSS(border.top);
      }
      if (border.right) {
        style.borderRight = this.borderToCSS(border.right);
      }
      if (border.bottom) {
        style.borderBottom = this.borderToCSS(border.bottom);
      }
      if (border.left) {
        style.borderLeft = this.borderToCSS(border.left);
      }
    }

    return style;
  }

  /**
   * Convert ExcelJS color to hex string.
   */
  private excelColorToHex(color: Partial<ExcelJS.Color>): string | undefined {
    if (color.argb) {
      // ARGB format: first 2 chars are alpha, rest is RGB
      const argb = color.argb;
      if (argb.length === 8) {
        return `#${argb.substring(2)}`;
      }
      return `#${argb}`;
    }
    if (color.theme !== undefined) {
      // Theme colors - use approximate mappings
      const themeColors: Record<number, string> = {
        0: '#FFFFFF', // background 1
        1: '#000000', // text 1
        2: '#EEECE1', // background 2
        3: '#1F497D', // text 2
        4: '#4F81BD', // accent 1
        5: '#C0504D', // accent 2
        6: '#9BBB59', // accent 3
        7: '#8064A2', // accent 4
        8: '#4BACC6', // accent 5
        9: '#F79646', // accent 6
      };
      return themeColors[color.theme];
    }
    return undefined;
  }

  /**
   * Convert ExcelJS border to CSS border string.
   */
  private borderToCSS(border: Partial<ExcelJS.Border>): string {
    const styleMap: Record<string, string> = {
      thin: '1px solid',
      medium: '2px solid',
      thick: '3px solid',
      dotted: '1px dotted',
      dashed: '1px dashed',
      double: '3px double',
    };

    const borderStyle = styleMap[border.style || 'thin'] || '1px solid';
    let color = '#ddd';

    if (border.color) {
      const hexColor = this.excelColorToHex(border.color);
      if (hexColor) {
        color = hexColor;
      }
    }

    return `${borderStyle} ${color}`;
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
          const rawRows = results.data as string[][];

          // Remove trailing empty rows
          while (rawRows.length > 0 && rawRows[rawRows.length - 1].every((cell) => !cell)) {
            rawRows.pop();
          }

          if (rawRows.length === 0) {
            resolve([]);
            return;
          }

          const colCount = Math.max(...rawRows.map((r) => r.length));

          // Convert to CellData format
          const rows: CellData[][] = rawRows.map((row) => {
            const cells: CellData[] = [];
            for (let i = 0; i < colCount; i++) {
              cells.push({
                value: row[i] || '',
                style: {},
              });
            }
            return cells;
          });

          resolve([
            {
              name: 'CSV Data',
              rows,
              colCount,
              colWidths: Array(colCount).fill(EXCEL_CONFIG.DEFAULT_COL_WIDTH),
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
   * Render a sheet using printToPDF approach.
   * This preserves complete content without truncation.
   */
  private async renderSheetWithPrintToPDF(
    sheet: SheetData,
    taskId: string,
    startPageIndex: number
  ): Promise<PageInfo[]> {
    // Determine if table is wide (needs landscape)
    const totalWidth = sheet.colWidths.reduce((a, b) => a + b, 0);
    const isWideTable = totalWidth > 700; // More than ~A4 portrait width

    const tableHtml = this.buildTableHtml(sheet);
    const fullHtml = this.buildExcelHtmlForPrint(tableHtml, sheet.name, isWideTable);

    const tempHtmlPath = await this.tempFileManager.createHtmlFile(fullHtml);
    const tempPdfPath = path.join(
      path.dirname(tempHtmlPath),
      `excel-${Date.now()}.pdf`
    );

    const window = await this.windowPool.acquire(
      EXCEL_CONFIG.RENDER_WIDTH,
      EXCEL_CONFIG.RENDER_HEIGHT
    );

    try {
      // Load and wait for render
      await this.loadAndWait(window, tempHtmlPath);

      // Print to PDF using Chromium's print engine
      console.log(`[ExcelSplitter] Converting sheet "${sheet.name}" to PDF (${isWideTable ? 'landscape' : 'portrait'})...`);
      const pdfBuffer = await window.webContents.printToPDF({
        pageSize: 'A4',
        landscape: isWideTable,
        printBackground: true,
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        preferCSSPageSize: true,
      });

      // Write PDF to temp file
      await fs.writeFile(tempPdfPath, pdfBuffer);
      console.log(`[ExcelSplitter] PDF created: ${pdfBuffer.length} bytes`);

      // Convert PDF to images
      const pages = await this.convertPdfToImages(tempPdfPath, taskId, startPageIndex);

      return pages;
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
      await fs.unlink(tempPdfPath).catch(() => {});
    }
  }

  /**
   * Convert PDF to page images using pdf-to-png-converter.
   * Automatically detects and removes blank pages.
   */
  private async convertPdfToImages(
    pdfPath: string,
    taskId: string,
    startPageIndex: number
  ): Promise<PageInfo[]> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    const relativeOutputFolder = path.relative(process.cwd(), taskDir);

    // Convert PDF to PNG images
    const pngResults = await pdfToPng(pdfPath, {
      outputFolder: relativeOutputFolder,
      viewportScale: WORKER_CONFIG.splitter.viewportScale,
      strictPagesToProcess: false,
      verbosityLevel: 0,
    });

    if (!pngResults || pngResults.length === 0) {
      throw new Error('PDF conversion produced no output');
    }

    console.log(`[ExcelSplitter] PDF converted to ${pngResults.length} page images`);

    // Rename files and build PageInfo array
    const pages: PageInfo[] = [];
    let currentPageNum = startPageIndex;
    let blankPagesRemoved = 0;

    for (let i = 0; i < pngResults.length; i++) {
      // Check if page is blank
      const isBlank = await this.isBlankPage(pngResults[i].path);
      if (isBlank) {
        console.log(`[ExcelSplitter] Removing blank page`);
        await fs.unlink(pngResults[i].path).catch(() => {});
        blankPagesRemoved++;
        continue;
      }

      const targetPath = ImagePathUtil.getPath(taskId, currentPageNum);

      // Rename from temporary name to standard format
      if (pngResults[i].path !== targetPath) {
        await fs.rename(pngResults[i].path, targetPath);
      }

      pages.push({
        page: currentPageNum,
        pageSource: currentPageNum,
        imagePath: targetPath,
      });
      currentPageNum++;
    }

    if (blankPagesRemoved > 0) {
      console.log(`[ExcelSplitter] Removed ${blankPagesRemoved} blank page(s)`);
    }

    return pages;
  }

  /**
   * Detect if a page image is blank (nearly all white).
   * Uses sharp to analyze pixel statistics.
   */
  private async isBlankPage(imagePath: string): Promise<boolean> {
    try {
      const sharp = (await import('sharp')).default;

      // Get image statistics
      const stats = await sharp(imagePath).stats();

      // Check all channels (R, G, B)
      const channels = stats.channels;

      // Calculate average mean and std across RGB channels
      const avgMean = (channels[0].mean + channels[1].mean + channels[2].mean) / 3;
      const avgStd = (channels[0].stdev + channels[1].stdev + channels[2].stdev) / 3;

      // Thresholds for blank page detection:
      // - Mean should be > 250 (very close to white 255)
      // - Std should be < 5 (very uniform color)
      const isBlank = avgMean > 250 && avgStd < 5;

      return isBlank;
    } catch (error) {
      // If analysis fails, assume page is not blank
      console.warn(`[ExcelSplitter] Failed to analyze page for blank detection:`, error);
      return false;
    }
  }

  /**
   * Build HTML table with styles and merged cells.
   */
  private buildTableHtml(sheet: SheetData): string {
    if (!sheet.rows.length) return '<table><tr><td>Empty</td></tr></table>';

    // Build colgroup for column widths
    const colgroup = sheet.colWidths
      .map((w) => `<col style="width: ${w}px;">`)
      .join('');

    const rowsHtml = sheet.rows
      .map((row, rowIdx) => {
        const cellsHtml = row
          .map((cell) => {
            // Skip hidden cells (part of merged range)
            if (cell.isHidden) {
              return '';
            }

            const isHeader = rowIdx === 0;
            const tag = isHeader ? 'th' : 'td';
            const attrs: string[] = [];
            const styles: string[] = [];

            // Add rowspan/colspan
            if (cell.rowSpan && cell.rowSpan > 1) {
              attrs.push(`rowspan="${cell.rowSpan}"`);
            }
            if (cell.colSpan && cell.colSpan > 1) {
              attrs.push(`colspan="${cell.colSpan}"`);
            }

            // Add styles
            if (cell.style.backgroundColor) {
              styles.push(`background-color: ${cell.style.backgroundColor}`);
            }
            if (cell.style.fontColor) {
              styles.push(`color: ${cell.style.fontColor}`);
            }
            if (cell.style.fontWeight === 'bold') {
              styles.push('font-weight: bold');
            }
            if (cell.style.fontStyle === 'italic') {
              styles.push('font-style: italic');
            }
            if (cell.style.fontSize) {
              styles.push(`font-size: ${cell.style.fontSize}px`);
            }
            if (cell.style.textDecoration) {
              styles.push(`text-decoration: ${cell.style.textDecoration}`);
            }
            if (cell.style.textAlign) {
              styles.push(`text-align: ${cell.style.textAlign}`);
            }
            if (cell.style.verticalAlign) {
              styles.push(`vertical-align: ${cell.style.verticalAlign}`);
            }
            if (cell.style.borderTop) {
              styles.push(`border-top: ${cell.style.borderTop}`);
            }
            if (cell.style.borderRight) {
              styles.push(`border-right: ${cell.style.borderRight}`);
            }
            if (cell.style.borderBottom) {
              styles.push(`border-bottom: ${cell.style.borderBottom}`);
            }
            if (cell.style.borderLeft) {
              styles.push(`border-left: ${cell.style.borderLeft}`);
            }

            const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
            const otherAttrs = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

            return `<${tag}${otherAttrs}${styleAttr}>${this.escapeHtml(cell.value)}</${tag}>`;
          })
          .join('');

        return `<tr>${cellsHtml}</tr>`;
      })
      .join('\n');

    return `<table><colgroup>${colgroup}</colgroup>${rowsHtml}</table>`;
  }

  /**
   * Build complete HTML for Excel table optimized for printToPDF.
   * Uses @page CSS rules to control page size and avoid row truncation.
   */
  private buildExcelHtmlForPrint(tableHtml: string, sheetName: string, isLandscape: boolean): string {
    const pageOrientation = isLandscape ? 'landscape' : 'portrait';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* CSS @page rule for precise PDF page control */
    @page {
      size: A4 ${pageOrientation};
      margin: 10mm;
    }

    @media print {
      html, body {
        margin: 0;
        padding: 0;
      }

      /* Prevent rows from breaking across pages */
      tr {
        page-break-inside: avoid !important;
      }

      /* Keep header with first rows */
      thead {
        display: table-header-group;
      }

      /* Prevent table from breaking awkwardly */
      table {
        page-break-inside: auto;
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
      font-size: 11px;
      line-height: 1.4;
    }

    body {
      padding: 10mm;
    }

    .sheet-name {
      font-size: 14px;
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #4CAF50;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: auto;
    }

    th, td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
      vertical-align: middle;
      word-wrap: break-word;
      /* Allow content to wrap instead of truncating */
      white-space: pre-wrap;
    }

    th {
      background-color: #f5f5f5;
      font-weight: 600;
      color: #333;
    }

    tr:nth-child(even) td:not([style*="background-color"]) {
      background-color: #fafafa;
    }
  </style>
</head>
<body>
  <div class="sheet-name">${this.escapeHtml(sheetName)}</div>
  ${tableHtml}
</body>
</html>`;
  }

  /**
   * Load HTML file and wait for rendering to complete.
   */
  private loadAndWait(window: Electron.BrowserWindow, htmlPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => clearTimeout(timeoutId);

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Page load timeout'));
      }, EXCEL_CONFIG.RENDER_TIMEOUT);

      window.webContents.once('did-finish-load', () => {
        cleanup();
        // Wait for rendering to stabilize
        setTimeout(resolve, 300);
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
   * Escape HTML special characters.
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
   * Wrap errors with user-friendly messages.
   */
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

  /**
   * Clean up temporary files for a task.
   */
  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    await fs.rm(taskDir, { recursive: true, force: true }).catch(() => {});
    this.windowPool.destroy();
  }
}
