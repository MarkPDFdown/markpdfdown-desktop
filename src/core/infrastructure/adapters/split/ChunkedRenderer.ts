import { BrowserWindow } from 'electron';

/**
 * Configuration for chunked rendering.
 */
export interface ChunkedRenderConfig {
  /** Height of each screenshot chunk in CSS pixels */
  chunkHeight: number;
  /** Device scale factor for high DPI rendering */
  deviceScaleFactor: number;
  /** Page width in CSS pixels */
  pageWidth: number;
  /** Page height in CSS pixels (for splitting output) */
  pageHeight: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkedRenderConfig = {
  chunkHeight: 4000,
  deviceScaleFactor: 2,
  pageWidth: 794, // A4 width at 96 DPI
  pageHeight: 1123, // A4 height at 96 DPI
};

/**
 * Page margin for output images (CSS pixels).
 * This controls how much white space appears at top/bottom of each page.
 * The content area per page = pageHeight - top - bottom
 */
const PAGE_MARGIN = {
  top: 50,
  bottom: 50,
};

/**
 * Chunked screenshot renderer.
 *
 * Renders long HTML documents in chunks to avoid memory issues
 * that occur when capturing very large screenshots at once.
 * Each chunk is then split into page-sized images.
 */
export class ChunkedRenderer {
  private readonly config: ChunkedRenderConfig;

  constructor(config: Partial<ChunkedRenderConfig> = {}) {
    this.config = { ...DEFAULT_CHUNK_CONFIG, ...config };
  }

  /**
   * Render HTML content to page images.
   *
   * This method:
   * 1. Sets window size to full document height
   * 2. Uses setZoomFactor for high DPI rendering
   * 3. Captures the entire document as one image
   * 4. Splits the image into pages using sharp
   *
   * @param window - BrowserWindow with HTML loaded
   * @param _totalHeight - Ignored, we recalculate internally
   * @param outputPathFn - Function to generate output path for each page
   * @returns Number of pages generated
   */
  async renderToPages(
    window: BrowserWindow,
    _totalHeight: number,
    outputPathFn: (pageNum: number) => string
  ): Promise<number> {
    const { deviceScaleFactor, pageWidth, pageHeight } = this.config;
    const sharp = (await import('sharp')).default;
    const fs = await import('fs');

    // Measure document height at zoom=1 to get accurate CSS pixel value
    window.webContents.setZoomFactor(1);
    await this.sleep(100);

    // Debug: log the HTML structure to understand page breaks
    const debugInfo = await window.webContents.executeJavaScript(`
      (function() {
        const sections = document.querySelectorAll('section.docx');
        const sectionInfo = Array.from(sections).map((s, i) => ({
          index: i,
          height: s.offsetHeight,
          marginTop: getComputedStyle(s).marginTop,
          marginBottom: getComputedStyle(s).marginBottom,
          paddingTop: getComputedStyle(s).paddingTop,
          paddingBottom: getComputedStyle(s).paddingBottom,
        }));
        return {
          sectionCount: sections.length,
          sections: sectionInfo,
          bodyHeight: document.body.scrollHeight,
          containerHeight: document.getElementById('docx-container')?.scrollHeight || 0,
        };
      })();
    `);
    console.log('[ChunkedRenderer] Debug info:', JSON.stringify(debugInfo, null, 2));

    const docHeight = await window.webContents.executeJavaScript(
      'document.body.scrollHeight'
    );

    console.log('[ChunkedRenderer] Config:', { deviceScaleFactor, pageWidth, pageHeight });
    console.log('[ChunkedRenderer] Document height (CSS px):', docHeight);

    // Validate height
    if (!docHeight || docHeight <= 0) {
      throw new Error('Document has no content to render (height is 0)');
    }

    // Set window to full document size (CSS pixels)
    window.setContentSize(pageWidth, docHeight);
    await this.sleep(200);

    // Capture the entire document at zoom=1
    // The system DPI scaling will be automatically applied by Electron
    const image = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: pageWidth,
      height: docHeight,
    });

    const fullBuffer = image.toPNG();

    // Get actual captured image dimensions
    const metadata = await sharp(fullBuffer).metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;

    console.log('[ChunkedRenderer] Captured image size:', imgWidth, 'x', imgHeight);

    // Calculate actual scale from the captured image
    // This accounts for system DPI scaling
    const actualScale = imgHeight / docHeight;
    console.log('[ChunkedRenderer] Actual scale (from system DPI):', actualScale);

    // Calculate content height per page (page height minus margins)
    const contentHeight = pageHeight - PAGE_MARGIN.top - PAGE_MARGIN.bottom;
    const scaledContentHeight = Math.round(contentHeight * actualScale);
    const scaledPageWidth = imgWidth;

    // Calculate total pages based on content height
    const totalPages = Math.ceil(imgHeight / scaledContentHeight);
    console.log('[ChunkedRenderer] Total pages:', totalPages);
    console.log('[ChunkedRenderer] Content height per page:', contentHeight, '(scaled:', scaledContentHeight, ')');

    if (totalPages <= 0) {
      throw new Error('Failed to calculate page count from document');
    }

    // Target dimensions for output
    const targetWidth = pageWidth * deviceScaleFactor;
    const targetPageHeight = pageHeight * deviceScaleFactor;
    const targetMarginTop = PAGE_MARGIN.top * deviceScaleFactor;

    // Split into pages
    let actualPageCount = 0;
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const topOffset = (pageNum - 1) * scaledContentHeight;
      const extractHeight = Math.min(scaledContentHeight, imgHeight - topOffset);

      console.log(`[ChunkedRenderer] Page ${pageNum}: topOffset=${topOffset}, extractHeight=${extractHeight}`);

      if (extractHeight <= 0) {
        break;
      }

      // Extract content from the full image
      const contentBuffer = await sharp(fullBuffer)
        .extract({
          left: 0,
          top: topOffset,
          width: scaledPageWidth,
          height: extractHeight,
        })
        .resize(targetWidth, Math.round(extractHeight * (deviceScaleFactor / actualScale)), {
          kernel: 'lanczos3',
        })
        .png()
        .toBuffer();

      // Create a full page with margins (white background)
      // Fixed page height ensures consistent output
      const pageBuffer = await sharp({
        create: {
          width: targetWidth,
          height: targetPageHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite([
          {
            input: contentBuffer,
            top: targetMarginTop,
            left: 0,
          },
        ])
        .png()
        .toBuffer();

      await fs.promises.writeFile(outputPathFn(pageNum), pageBuffer);
      actualPageCount++;
    }

    return actualPageCount;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
