import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkedRenderer, ChunkedRenderConfig } from '../ChunkedRenderer.js';

// Mock sharp
vi.mock('sharp', () => {
  const mockSharp = vi.fn().mockReturnValue({
    metadata: vi.fn().mockResolvedValue({ width: 1588, height: 2246 }),
    extract: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-image')),
  });

  return {
    default: mockSharp,
  };
});

// Create mock BrowserWindow
const createMockWindow = () => {
  const mockCapturePage = vi.fn().mockResolvedValue({
    toPNG: () => Buffer.from('mock-png-data'),
  });

  return {
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      capturePage: mockCapturePage,
    },
  } as unknown as Electron.BrowserWindow;
};

describe('ChunkedRenderer', () => {
  let renderer: ChunkedRenderer;
  let mockWindow: Electron.BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = new ChunkedRenderer();
    mockWindow = createMockWindow();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const r = new ChunkedRenderer();
      expect(r).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<ChunkedRenderConfig> = {
        chunkHeight: 2000,
        pageWidth: 800,
        pageHeight: 1000,
        deviceScaleFactor: 1,
      };
      const r = new ChunkedRenderer(config);
      expect(r).toBeDefined();
    });
  });

  describe('renderToPages()', () => {
    it('should scroll and capture pages', async () => {
      const outputPathFn = vi.fn((pageNum: number) => `/output/page-${pageNum}.png`);

      // Set up mock to return a reasonable height
      (mockWindow.webContents.executeJavaScript as ReturnType<typeof vi.fn>)
        .mockResolvedValue(undefined);

      const pageCount = await renderer.renderToPages(
        mockWindow,
        1200, // Total height less than one page
        outputPathFn
      );

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
      expect(mockWindow.webContents.capturePage).toHaveBeenCalled();
      expect(pageCount).toBeGreaterThan(0);
    });

    it('should call outputPathFn for each page', async () => {
      const outputPathFn = vi.fn((pageNum: number) => `/output/page-${pageNum}.png`);

      await renderer.renderToPages(mockWindow, 500, outputPathFn);

      expect(outputPathFn).toHaveBeenCalled();
    });

    it('should handle multiple chunks for tall documents', async () => {
      const outputPathFn = vi.fn((pageNum: number) => `/output/page-${pageNum}.png`);

      // Render a document taller than chunk height
      await renderer.renderToPages(mockWindow, 10000, outputPathFn);

      // Should have scrolled multiple times
      const scrollCalls = (mockWindow.webContents.executeJavaScript as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: unknown[]) => (call[0] as string).includes('scrollTo'));

      expect(scrollCalls.length).toBeGreaterThan(1);
    });

    it('should throw error when totalHeight is 0', async () => {
      const outputPathFn = vi.fn((pageNum: number) => `/output/page-${pageNum}.png`);

      await expect(renderer.renderToPages(mockWindow, 0, outputPathFn))
        .rejects.toThrow('Document has no content to render');
    });

    it('should throw error when totalHeight is negative', async () => {
      const outputPathFn = vi.fn((pageNum: number) => `/output/page-${pageNum}.png`);

      await expect(renderer.renderToPages(mockWindow, -100, outputPathFn))
        .rejects.toThrow('Document has no content to render');
    });
  });
});
