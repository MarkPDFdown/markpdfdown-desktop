import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { PageRangeParser } from '../../../domain/split/PageRangeParser.js';
import { PathValidator } from './PathValidator.js';

/**
 * Get the directory path for loading bundles.
 * Works in both development and production environments.
 */
function getBundleDir(): string {
  try {
    // In Electron, use app.getAppPath() to get the correct base path
    // In production: resources/app.asar or resources/app
    // In development: project root
    const appPath = app?.getAppPath?.() || process.cwd();

    // Check if running from dist (production/dev server) or source
    const distBundlePath = path.join(appPath, 'dist', 'main', 'bundles');

    // Prefer dist path in production/dev, fallback to src for tests
    return distBundlePath;
  } catch {
    // Fallback for test environment where electron is not available
    return path.join(process.cwd(), 'src/core/infrastructure/adapters/split/bundles');
  }
}

/**
 * Slide configuration constants.
 */
const SLIDE_CONFIG = {
  /** Slide width (16:9 aspect ratio) */
  WIDTH: 1280,
  /** Slide height (16:9 aspect ratio) */
  HEIGHT: 720,
  /** Device scale factor for high DPI */
  DEVICE_SCALE_FACTOR: 2,
  /** Render timeout in milliseconds */
  RENDER_TIMEOUT: 30000,
} as const;

/**
 * Parsed slide data (for fallback text extraction).
 */
interface SlideData {
  index: number;
  title?: string;
  content: string[];
  notes?: string;
  background?: string;
}

/**
 * PowerPoint splitter.
 *
 * Supports: .pptx, .potx
 *
 * Technical approach:
 * - Primary: Uses pptx-preview library for high-fidelity rendering
 * - Fallback: Uses JSZip + fast-xml-parser for text extraction
 * - Renders each slide as an individual PNG image
 */
export class PowerPointSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly windowPool: RenderWindowPool;
  private readonly tempFileManager: TempFileManager;
  private readonly xmlParser: XMLParser;
  private bundleCache: string | null = null;

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
   * Split a PowerPoint file into slide images.
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

      // Get slide count using JSZip
      const slideCount = await this.getSlideCount(zip);

      if (slideCount === 0) {
        throw new Error('PowerPoint file contains no slides');
      }

      // Parse page range
      const parsed = PageRangeParser.parse(task.page_range, slideCount);
      const selectedIndices = new Set(parsed);

      // Try pptx-preview rendering first
      try {
        return await this.renderWithPptxPreview(
          fileBuffer,
          slideCount,
          selectedIndices,
          taskId
        );
      } catch (previewError) {
        console.warn(
          'pptx-preview rendering failed, falling back to text extraction:',
          previewError
        );
        // Fallback to text extraction
        return await this.renderWithTextExtraction(zip, selectedIndices, taskId);
      }
    } catch (error) {
      throw this.wrapError(error, filename);
    } finally {
      await this.tempFileManager.cleanup();
    }
  }

  /**
   * Get slide count from PPTX archive.
   */
  private async getSlideCount(zip: JSZip): Promise<number> {
    const slideFiles = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name)
    );
    return slideFiles.length;
  }

  /**
   * Render slides using pptx-preview library.
   */
  private async renderWithPptxPreview(
    fileBuffer: Buffer,
    slideCount: number,
    selectedIndices: Set<number>,
    taskId: string
  ): Promise<SplitResult> {
    const pages: PageInfo[] = [];
    let outputPageNum = 1;

    // Load the bundle once and cache it
    const bundle = await this.loadPptxPreviewBundle();

    for (let slideIndex = 1; slideIndex <= slideCount; slideIndex++) {
      if (!selectedIndices.has(slideIndex)) {
        continue;
      }

      const imagePath = ImagePathUtil.getPath(taskId, outputPageNum);
      await this.renderSlideWithPptxPreview(fileBuffer, slideIndex, imagePath, bundle);

      pages.push({
        page: outputPageNum,
        pageSource: slideIndex,
        imagePath,
      });

      outputPageNum++;
    }

    return { pages, totalPages: pages.length };
  }

  /**
   * Load the pptx-preview bundle from file.
   */
  private async loadPptxPreviewBundle(): Promise<string> {
    if (this.bundleCache) {
      return this.bundleCache;
    }

    const bundlePath = path.join(getBundleDir(), 'pptx-preview.bundle.js');
    this.bundleCache = await fs.readFile(bundlePath, 'utf-8');
    return this.bundleCache;
  }

  /**
   * Build HTML template for pptx-preview rendering.
   */
  private buildPptxPreviewHtml(
    base64Data: string,
    slideIndex: number,
    bundle: string
  ): string {
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
      overflow: hidden;
      background: white;
    }
    #slide-container {
      width: ${SLIDE_CONFIG.WIDTH}px;
      height: ${SLIDE_CONFIG.HEIGHT}px;
      overflow: hidden;
    }
    /* Hide navigation buttons and pagination */
    .pptx-wrapper-btn,
    .pptx-wrapper-pagination {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="slide-container"></div>
  <script>${bundle}</script>
  <script>
    (async function() {
      window.renderComplete = false;
      window.renderError = null;

      try {
        // Decode base64 to ArrayBuffer
        const base64 = '${base64Data}';
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        // Initialize pptx-preview (use window.PptxPreview for explicit global access)
        const container = document.getElementById('slide-container');
        const previewer = window.PptxPreview.init(container, {
          width: ${SLIDE_CONFIG.WIDTH},
          height: ${SLIDE_CONFIG.HEIGHT},
          mode: 'slide'
        });

        // Load and render
        await previewer.load(arrayBuffer);
        previewer.renderSingleSlide(${slideIndex - 1}); // 0-based index

        // Wait for render completion
        await new Promise(resolve => setTimeout(resolve, 500));

        window.renderComplete = true;
      } catch (error) {
        window.renderError = error.message || 'Unknown error';
        window.renderComplete = true;
      }
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Render a single slide using pptx-preview.
   */
  private async renderSlideWithPptxPreview(
    fileBuffer: Buffer,
    slideIndex: number,
    outputPath: string,
    bundle: string
  ): Promise<void> {
    const base64Data = fileBuffer.toString('base64');
    const html = this.buildPptxPreviewHtml(base64Data, slideIndex, bundle);
    const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);

    const window = await this.windowPool.acquire(SLIDE_CONFIG.WIDTH, SLIDE_CONFIG.HEIGHT);

    try {
      window.webContents.setZoomFactor(SLIDE_CONFIG.DEVICE_SCALE_FACTOR);
      await this.loadAndWaitForRender(window, tempHtmlPath);

      // Check for render errors
      const renderError = await window.webContents.executeJavaScript('window.renderError');
      if (renderError) {
        throw new Error(`pptx-preview render error: ${renderError}`);
      }

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
   * Load HTML and wait for pptx-preview render to complete.
   */
  private loadAndWaitForRender(
    window: Electron.BrowserWindow,
    htmlPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(pollId);
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('pptx-preview render timeout'));
      }, SLIDE_CONFIG.RENDER_TIMEOUT);

      let pollId: ReturnType<typeof setInterval>;

      window.webContents.once('did-finish-load', () => {
        // Poll for render completion
        pollId = setInterval(async () => {
          try {
            const complete = await window.webContents.executeJavaScript(
              'window.renderComplete'
            );
            if (complete) {
              cleanup();
              // Additional wait for visual rendering
              setTimeout(resolve, 200);
            }
          } catch {
            // Ignore errors during polling
          }
        }, 100);
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
   * Fallback: Render slides using text extraction.
   */
  private async renderWithTextExtraction(
    zip: JSZip,
    selectedIndices: Set<number>,
    taskId: string
  ): Promise<SplitResult> {
    const slides = await this.parseSlides(zip);

    if (slides.length === 0) {
      throw new Error('PowerPoint file contains no slides');
    }

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
  }

  /**
   * Parse slides from PPTX archive (for fallback).
   */
  private async parseSlides(zip: JSZip): Promise<SlideData[]> {
    const slides: SlideData[] = [];

    // Get all slide files
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
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
   * Extract slide content from parsed XML (for fallback).
   */
  private extractSlideContent(parsed: unknown, index: number): SlideData {
    const texts: string[] = [];
    let title: string | undefined;

    // Recursively extract all text content
    const extractTexts = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object') return;

      const record = obj as Record<string, unknown>;

      // Extract <a:t> tag content
      if (record['a:t']) {
        const text = typeof record['a:t'] === 'string' ? record['a:t'] : String(record['a:t']);
        if (text.trim()) {
          texts.push(text.trim());
        }
      }

      // Recursively process arrays and objects
      for (const key of Object.keys(record)) {
        if (Array.isArray(record[key])) {
          (record[key] as unknown[]).forEach(extractTexts);
        } else if (typeof record[key] === 'object') {
          extractTexts(record[key]);
        }
      }
    };

    extractTexts(parsed);

    // First text is typically the title
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
   * Build slide HTML (for fallback).
   */
  private buildSlideHtml(slide: SlideData): string {
    const titleHtml = slide.title
      ? `<h1 class="slide-title">${this.escapeHtml(slide.title)}</h1>`
      : '';

    const contentHtml = slide.content.map((text) => `<p>${this.escapeHtml(text)}</p>`).join('\n');

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
   * Render a slide to an image file (for fallback).
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
   * Load HTML file and wait for rendering to complete (for fallback).
   */
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
