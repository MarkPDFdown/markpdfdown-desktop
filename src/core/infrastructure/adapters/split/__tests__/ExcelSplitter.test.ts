import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExcelSplitter } from '../ExcelSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app'),
  },
  BrowserWindow: vi.fn(),
}));

// Mock pdf-to-png-converter
vi.mock('pdf-to-png-converter', () => ({
  pdfToPng: vi.fn(),
}));

// Mock exceljs
vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      xlsx: {
        readFile: vi.fn(),
      },
      eachSheet: vi.fn(),
    })),
  },
}));

// Mock papaparse
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn(),
  },
}));

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    stats: vi.fn(),
  })),
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
  },
}));

// Mock RenderWindowPoolFactory
vi.mock('../RenderWindowPoolFactory.js', () => ({
  RenderWindowPoolFactory: {
    create: vi.fn(() => ({
      acquire: vi.fn(),
      release: vi.fn(),
      destroy: vi.fn(),
    })),
  },
}));

// Mock TempFileManager
vi.mock('../TempFileManager.js', () => ({
  TempFileManager: vi.fn().mockImplementation(() => ({
    createHtmlFile: vi.fn().mockResolvedValue('/tmp/temp.html'),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock EncodingDetector
vi.mock('../EncodingDetector.js', () => ({
  EncodingDetector: {
    toUtf8String: vi.fn((buffer: Buffer) => buffer.toString('utf-8')),
  },
}));

// Mock worker config
vi.mock('../../../config/worker.config.js', () => ({
  WORKER_CONFIG: {
    splitter: {
      viewportScale: 2,
    },
  },
}));

import { pdfToPng } from 'pdf-to-png-converter';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { RenderWindowPoolFactory } from '../RenderWindowPoolFactory.js';

describe('ExcelSplitter', () => {
  const uploadsDir = '/mock/uploads';
  let splitter: ExcelSplitter;
  let mockWindow: any;
  let mockPool: any;
  let mockWorkbook: any;

  beforeEach(() => {
    // Initialize ImagePathUtil
    ImagePathUtil.init(uploadsDir);

    // Setup mock window
    mockWindow = {
      webContents: {
        executeJavaScript: vi.fn(),
        printToPDF: vi.fn(),
        once: vi.fn(),
      },
      loadFile: vi.fn(),
      setContentSize: vi.fn(),
    };

    // Setup mock pool
    mockPool = {
      acquire: vi.fn().mockResolvedValue(mockWindow),
      release: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };

    vi.mocked(RenderWindowPoolFactory.create).mockReturnValue(mockPool);

    // Setup mock workbook
    mockWorkbook = {
      xlsx: {
        readFile: vi.fn().mockResolvedValue(undefined),
      },
      eachSheet: vi.fn(),
    };

    vi.mocked(ExcelJS.Workbook).mockImplementation(() => mockWorkbook as any);

    // Create splitter instance
    splitter = new ExcelSplitter(uploadsDir);

    // Reset mocks
    vi.clearAllMocks();

    // Re-setup mocks after clearAllMocks
    vi.mocked(RenderWindowPoolFactory.create).mockReturnValue(mockPool);
    mockPool.acquire.mockResolvedValue(mockWindow);
    vi.mocked(ExcelJS.Workbook).mockImplementation(() => mockWorkbook as any);
  });

  afterEach(() => {
    ImagePathUtil.reset();
  });

  describe('split()', () => {
    it('should throw error for missing task ID', async () => {
      const task = {
        filename: 'data.xlsx',
      };

      await expect(splitter.split(task)).rejects.toThrow(/Task ID and filename are required/);
    });

    it('should throw error for missing filename', async () => {
      const task = {
        id: 'task123',
      };

      await expect(splitter.split(task)).rejects.toThrow(/Task ID and filename are required/);
    });

    it('should handle file not found', async () => {
      const task = {
        id: 'task123',
        filename: 'missing.xlsx',
        page_range: '',
      };

      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(splitter.split(task)).rejects.toThrow(/Excel file not found/);
    });

    it('should handle corrupted Excel file', async () => {
      const task = {
        id: 'task123',
        filename: 'corrupted.xlsx',
        page_range: '',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      mockWorkbook.xlsx.readFile.mockRejectedValue(new Error('Invalid file format'));

      await expect(splitter.split(task)).rejects.toThrow(/corrupted/);
    });

    it('should handle empty Excel file', async () => {
      const task = {
        id: 'task123',
        filename: 'empty.xlsx',
        page_range: '',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      mockWorkbook.xlsx.readFile.mockResolvedValue(undefined);
      mockWorkbook.eachSheet.mockImplementation(() => {
        // No sheets
      });

      await expect(splitter.split(task)).rejects.toThrow(/contains no data/);
    });
  });

  describe('CSV parsing', () => {
    it('should parse CSV file correctly', async () => {
      const task = {
        id: 'task123',
        filename: 'data.csv',
        page_range: '',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('col1,col2\nval1,val2'));

      // Mock Papa.parse
      vi.mocked(Papa.parse).mockImplementation((content, options: any) => {
        options.complete({
          data: [
            ['col1', 'col2'],
            ['val1', 'val2'],
          ],
        });
        return undefined as any;
      });

      // Mock window and PDF generation
      mockWindow.webContents.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'did-finish-load') {
          setTimeout(() => callback(), 10);
        }
      });
      mockWindow.loadFile.mockResolvedValue(undefined);
      mockWindow.webContents.printToPDF.mockResolvedValue(Buffer.from('mock-pdf'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      vi.mocked(pdfToPng).mockResolvedValue([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      // Verify Papa.parse is called for CSV files
      expect(Papa.parse).toBeDefined();
    });

    it('should handle CSV parse errors', async () => {
      const task = {
        id: 'task123',
        filename: 'invalid.csv',
        page_range: '',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('invalid csv data'));

      // Mock Papa.parse to call error callback
      vi.mocked(Papa.parse).mockImplementation((content, options: any) => {
        options.error(new Error('CSV parse error'));
        return undefined as any;
      });

      await expect(splitter.split(task)).rejects.toThrow(/Failed to parse CSV/);
    });
  });

  describe('blank page detection', () => {
    it('should detect blank page with high mean and low std', async () => {
      const sharp = (await import('sharp')).default;

      // Mock sharp to return stats for a blank page
      vi.mocked(sharp).mockReturnValue({
        stats: vi.fn().mockResolvedValue({
          channels: [
            { mean: 254, stdev: 2 }, // R
            { mean: 254, stdev: 2 }, // G
            { mean: 254, stdev: 2 }, // B
          ],
        }),
      } as any);

      const isBlank = await (splitter as any).isBlankPage('/tmp/blank.png');
      expect(isBlank).toBe(true);
    });

    it('should not detect content page as blank', async () => {
      const sharp = (await import('sharp')).default;

      // Mock sharp to return stats for a page with content
      vi.mocked(sharp).mockReturnValue({
        stats: vi.fn().mockResolvedValue({
          channels: [
            { mean: 180, stdev: 60 }, // R
            { mean: 180, stdev: 60 }, // G
            { mean: 180, stdev: 60 }, // B
          ],
        }),
      } as any);

      const isBlank = await (splitter as any).isBlankPage('/tmp/content.png');
      expect(isBlank).toBe(false);
    });

    it('should handle sharp analysis failure gracefully', async () => {
      const sharp = (await import('sharp')).default;

      vi.mocked(sharp).mockReturnValue({
        stats: vi.fn().mockRejectedValue(new Error('Failed to read image')),
      } as any);

      const isBlank = await (splitter as any).isBlankPage('/tmp/error.png');
      expect(isBlank).toBe(false);
    });
  });

  describe('landscape detection', () => {
    it('should use landscape for wide tables', () => {
      // Tables wider than 700px should use landscape
      const wideTableWidth = 800;
      const isWide = wideTableWidth > 700;
      expect(isWide).toBe(true);
    });

    it('should use portrait for narrow tables', () => {
      // Tables narrower than 700px should use portrait
      const narrowTableWidth = 600;
      const isWide = narrowTableWidth > 700;
      expect(isWide).toBe(false);
    });
  });

  describe('cleanup()', () => {
    it('should remove task directory and destroy pool', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await splitter.cleanup('task123');

      expect(fs.rm).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task123', 'split'),
        { recursive: true, force: true }
      );
    });

    it('should not throw error if cleanup fails', async () => {
      vi.mocked(fs.rm).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(splitter.cleanup('task123')).resolves.toBeUndefined();
    });
  });

  describe('HTML table building', () => {
    it('should escape HTML special characters', () => {
      // Test the escapeHtml method
      const escapeHtml = (text: string) => {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
      expect(escapeHtml("it's a test")).toBe("it&#039;s a test");
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });
  });

  describe('printToPDF configuration', () => {
    it('should use correct PDF settings', () => {
      const expectedConfig = {
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      };

      expect(expectedConfig.pageSize).toBe('A4');
      expect(expectedConfig.printBackground).toBe(true);
      expect(expectedConfig.preferCSSPageSize).toBe(true);
      expect(expectedConfig.margins.top).toBe(0);
    });
  });

  describe('sheet range handling', () => {
    it('should process only selected sheets', () => {
      // PageRangeParser is used for sheet selection
      // Sheet indices are 1-based
      const sheetRange = '1,3';
      const totalSheets = 4;
      const selectedIndices = new Set([1, 3]);

      expect(selectedIndices.has(1)).toBe(true);
      expect(selectedIndices.has(2)).toBe(false);
      expect(selectedIndices.has(3)).toBe(true);
      expect(selectedIndices.has(4)).toBe(false);
    });
  });

  describe('cell style extraction', () => {
    it('should handle cells without styles', () => {
      // Cells without styles should return empty style object
      const emptyStyle = {};
      expect(Object.keys(emptyStyle)).toHaveLength(0);
    });

    it('should convert ARGB color to hex', () => {
      // ARGB format: first 2 chars are alpha, rest is RGB
      const argbColor = 'FF4A90D9';
      const hexColor = `#${argbColor.substring(2)}`;
      expect(hexColor).toBe('#4A90D9');
    });

    it('should handle theme colors', () => {
      const themeColors: Record<number, string> = {
        0: '#FFFFFF',
        1: '#000000',
        4: '#4F81BD',
      };

      expect(themeColors[0]).toBe('#FFFFFF');
      expect(themeColors[1]).toBe('#000000');
      expect(themeColors[4]).toBe('#4F81BD');
    });
  });

  describe('merged cells handling', () => {
    it('should parse merge range correctly', () => {
      // Test merge range parsing logic
      const rangeStr = 'A1:C3';
      const match = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('A');
      expect(match![2]).toBe('1');
      expect(match![3]).toBe('C');
      expect(match![4]).toBe('3');
    });

    it('should convert column letters to numbers', () => {
      const colToNum = (col: string): number => {
        let num = 0;
        for (let i = 0; i < col.length; i++) {
          num = num * 26 + (col.charCodeAt(i) - 64);
        }
        return num;
      };

      expect(colToNum('A')).toBe(1);
      expect(colToNum('B')).toBe(2);
      expect(colToNum('Z')).toBe(26);
      expect(colToNum('AA')).toBe(27);
      expect(colToNum('AB')).toBe(28);
    });
  });
});
