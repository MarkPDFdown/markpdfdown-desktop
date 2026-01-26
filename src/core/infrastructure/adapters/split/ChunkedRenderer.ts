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
   * @param window - BrowserWindow with HTML loaded
   * @param totalHeight - Total document height in CSS pixels
   * @param outputPathFn - Function to generate output path for each page
   * @returns Number of pages generated
   */
  async renderToPages(
    window: BrowserWindow,
    totalHeight: number,
    outputPathFn: (pageNum: number) => string
  ): Promise<number> {
    const { chunkHeight, deviceScaleFactor, pageWidth, pageHeight } = this.config;
    const sharp = (await import('sharp')).default;

    // Validate totalHeight - must be positive
    if (!totalHeight || totalHeight <= 0) {
      throw new Error('Document has no content to render (totalHeight is 0)');
    }

    const scaledPageHeight = pageHeight * deviceScaleFactor;
    const scaledPageWidth = pageWidth * deviceScaleFactor;

    let pageNum = 1;
    let processedHeight = 0;
    let carryOverBuffer: Buffer | null = null;
    let carryOverHeight = 0;

    while (processedHeight < totalHeight) {
      // Calculate capture height for this chunk
      const captureHeight = Math.min(chunkHeight, totalHeight - processedHeight);

      // Skip if nothing to capture
      if (captureHeight <= 0) {
        break;
      }

      // Scroll to target position
      await window.webContents.executeJavaScript(`window.scrollTo(0, ${processedHeight})`);
      await this.sleep(50);

      // Capture current viewport
      const image = await window.webContents.capturePage({
        x: 0,
        y: 0,
        width: pageWidth,
        height: captureHeight,
      });
      const chunkBuffer = image.toPNG();

      // Get actual image dimensions
      const chunkMetadata = await sharp(chunkBuffer).metadata();
      const actualChunkWidth = chunkMetadata.width || 0;
      const actualChunkHeight = chunkMetadata.height || 0;

      // Skip empty captures
      if (actualChunkWidth === 0 || actualChunkHeight === 0) {
        processedHeight += captureHeight;
        continue;
      }

      // Combine with carry-over from previous chunk
      let workingBuffer: Buffer;
      let workingHeight: number;
      let workingWidth: number;

      if (carryOverBuffer) {
        // Vertically stack carry-over and current chunk
        const carryOverMetadata = await sharp(carryOverBuffer).metadata();
        const carryOverActualHeight = carryOverMetadata.height || carryOverHeight;
        const carryOverActualWidth = carryOverMetadata.width || scaledPageWidth;

        // Use the maximum width of both images
        workingWidth = Math.max(carryOverActualWidth, actualChunkWidth);
        workingHeight = carryOverActualHeight + actualChunkHeight;

        workingBuffer = await sharp({
          create: {
            width: workingWidth,
            height: workingHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .composite([
            { input: carryOverBuffer, top: 0, left: 0 },
            { input: chunkBuffer, top: carryOverActualHeight, left: 0 },
          ])
          .png()
          .toBuffer();

        carryOverBuffer = null;
        carryOverHeight = 0;
      } else {
        workingBuffer = chunkBuffer;
        workingHeight = actualChunkHeight;
        workingWidth = actualChunkWidth;
      }

      // Extract full pages from working buffer
      let extractedHeight = 0;
      while (extractedHeight + scaledPageHeight <= workingHeight) {
        const outputPath = outputPathFn(pageNum);

        // Ensure extract dimensions are valid
        const extractWidth = Math.min(scaledPageWidth, workingWidth);
        const extractHeight = Math.min(scaledPageHeight, workingHeight - extractedHeight);

        if (extractWidth > 0 && extractHeight > 0) {
          await sharp(workingBuffer)
            .extract({
              left: 0,
              top: extractedHeight,
              width: extractWidth,
              height: extractHeight,
            })
            .toFile(outputPath);

          pageNum++;
        }
        extractedHeight += scaledPageHeight;
      }

      // Save remaining content for next iteration
      if (extractedHeight < workingHeight) {
        const remainingHeight = workingHeight - extractedHeight;
        const extractWidth = Math.min(scaledPageWidth, workingWidth);

        if (extractWidth > 0 && remainingHeight > 0) {
          carryOverBuffer = await sharp(workingBuffer)
            .extract({
              left: 0,
              top: extractedHeight,
              width: extractWidth,
              height: remainingHeight,
            })
            .toBuffer();
          carryOverHeight = remainingHeight;
        }
      }

      processedHeight += captureHeight;
    }

    // Handle final carry-over (content that doesn't fill a complete page)
    if (carryOverBuffer && carryOverHeight > 0) {
      const outputPath = outputPathFn(pageNum);
      await sharp(carryOverBuffer).toFile(outputPath);
      pageNum++;
    }

    // Ensure at least one page was generated
    if (pageNum <= 1) {
      throw new Error('Failed to render any pages from document');
    }

    return pageNum - 1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
