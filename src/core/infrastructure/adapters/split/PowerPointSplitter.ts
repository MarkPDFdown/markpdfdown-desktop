import { promises as fs } from 'fs';
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
 * Slide configuration constants.
 */
const SLIDE_CONFIG = {
  /** Slide width (16:9 aspect ratio) */
  WIDTH: 1280,
  /** Slide height (16:9 aspect ratio) */
  HEIGHT: 720,
  /** Device scale factor for high DPI */
  DEVICE_SCALE_FACTOR: 2,
} as const;

/**
 * Parsed slide data.
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
 * - Uses JSZip to extract PPTX file contents
 * - Parses ppt/slides/slide*.xml using fast-xml-parser
 * - Renders each slide as an individual PNG image
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

      // Parse slides
      const slides = await this.parseSlides(zip);

      if (slides.length === 0) {
        throw new Error('PowerPoint file contains no slides');
      }

      // Parse page range
      const parsed = PageRangeParser.parse(task.page_range, slides.length);
      const selectedIndices = new Set(parsed);

      // Render selected slides
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
   * Parse slides from PPTX archive.
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
   * Extract slide content from parsed XML.
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
   * Build slide HTML.
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
   * Render a slide to an image file.
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
   * Load HTML file and wait for rendering to complete.
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
