import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { PDFSplitter } from '../PDFSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { WORKER_CONFIG } from '../../../config/worker.config.js';

/**
 * Runs against the real pdf-to-png-converter, pdf-lib and file system, because
 * the unit tests mock the library whose path handling caused issue #75.
 */
describe('PDFSplitter with the real converter', () => {
  const TASK_ID = 'task-1';
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const PAGE_SIZE_PT = 100;

  let workDir: string;
  let uploadsDir: string;
  let cwd: string;
  let splitDir: string;
  let splitter: PDFSplitter;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-splitter-'));
    uploadsDir = path.join(workDir, 'userData', 'files');
    cwd = path.join(workDir, 'install-dir');
    splitDir = path.join(uploadsDir, TASK_ID, 'split');
    await fs.mkdir(path.join(uploadsDir, TASK_ID), { recursive: true });
    await fs.mkdir(cwd);

    const pdf = await PDFDocument.create();
    pdf.addPage([PAGE_SIZE_PT, PAGE_SIZE_PT]);
    pdf.addPage([PAGE_SIZE_PT, PAGE_SIZE_PT]);
    await fs.writeFile(path.join(uploadsDir, TASK_ID, 'doc.pdf'), await pdf.save());

    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    ImagePathUtil.init(uploadsDir);
    splitter = new PDFSplitter(uploadsDir);
  });

  afterEach(async () => {
    ImagePathUtil.reset();
    vi.restoreAllMocks();
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('should render every page to the split dir and leave nothing in cwd', async () => {
    const result = await splitter.split({ id: TASK_ID, filename: 'doc.pdf', page_range: '' });

    expect(result.pages).toEqual([
      { page: 1, pageSource: 1, imagePath: path.join(splitDir, 'page-1.png') },
      { page: 2, pageSource: 2, imagePath: path.join(splitDir, 'page-2.png') },
    ]);
    expect((await fs.readdir(splitDir)).sort()).toEqual(['page-1.png', 'page-2.png']);
    expect(await fs.readdir(cwd)).toEqual([]);

    const png = await fs.readFile(path.join(splitDir, 'page-1.png'));
    expect(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
    // IHDR width: the configured viewport scale (2.0) must still be applied.
    expect(png.readUInt32BE(16)).toBe(PAGE_SIZE_PT * 2);
  });

  it('should number pages sequentially and keep the source page for a page range', async () => {
    const result = await splitter.split({ id: TASK_ID, filename: 'doc.pdf', page_range: '2' });

    expect(result.pages).toEqual([
      { page: 1, pageSource: 2, imagePath: path.join(splitDir, 'page-1.png') },
    ]);
    expect(await fs.readdir(splitDir)).toEqual(['page-1.png']);
  });

  describe('across render batches', () => {
    const BATCH_SIZE = WORKER_CONFIG.splitter.renderBatchSize;
    const PAGE_COUNT = BATCH_SIZE * 2 + 3;

    /** Every page gets its own width, which identifies it in the rendered PNG. */
    const widthOf = (sourcePage: number) => PAGE_SIZE_PT + sourcePage;

    beforeEach(async () => {
      const pdf = await PDFDocument.create();
      for (let page = 1; page <= PAGE_COUNT; page++) {
        pdf.addPage([widthOf(page), PAGE_SIZE_PT]);
      }
      await fs.writeFile(path.join(uploadsDir, TASK_ID, 'doc.pdf'), await pdf.save());
    });

    async function expectPages(pageRange: string, sourcePages: number[]) {
      const result = await splitter.split({ id: TASK_ID, filename: 'doc.pdf', page_range: pageRange });

      expect(result.totalPages).toBe(sourcePages.length);
      expect(result.pages).toEqual(
        sourcePages.map((pageSource, i) => ({
          page: i + 1,
          pageSource,
          imagePath: path.join(splitDir, `page-${i + 1}.png`),
        }))
      );
      expect((await fs.readdir(splitDir)).sort()).toEqual(
        sourcePages.map((_, i) => `page-${i + 1}.png`).sort()
      );
      for (const [i, sourcePage] of sourcePages.entries()) {
        const png = await fs.readFile(path.join(splitDir, `page-${i + 1}.png`));
        expect(png.readUInt32BE(16)).toBe(widthOf(sourcePage) * 2);
      }
    }

    it('should render every page in order', async () => {
      await expectPages('', Array.from({ length: PAGE_COUNT }, (_, i) => i + 1));
    });

    it('should render a page range in order', async () => {
      const lastPages = [PAGE_COUNT - 1, PAGE_COUNT];
      await expectPages(
        `1,3-${BATCH_SIZE + 4},${lastPages.join(',')}`,
        [1, ...Array.from({ length: BATCH_SIZE + 2 }, (_, i) => i + 3), ...lastPages]
      );
    });
  });

  it('should keep a page that pdf-lib does not count because its node has no /Type', async () => {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 3 /Kids [3 0 R 4 0 R 5 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
      '<< /Parent 2 0 R /MediaBox [0 0 100 100] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, i) => {
      const offset = pdf.length;
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    await fs.writeFile(path.join(uploadsDir, TASK_ID, 'doc.pdf'), pdf, 'latin1');

    const result = await splitter.split({ id: TASK_ID, filename: 'doc.pdf', page_range: '' });

    expect(result.pages.map((page) => page.pageSource)).toEqual([1, 2, 3]);
    expect((await fs.readdir(splitDir)).sort()).toEqual(['page-1.png', 'page-2.png', 'page-3.png']);
  });

  it('should not blame the source PDF when the split dir cannot be created', async () => {
    vi.spyOn(splitter as any, 'sleep').mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A regular file in place of the split dir makes the real mkdir fail.
    await fs.writeFile(splitDir, '');

    const failure = splitter.split({ id: TASK_ID, filename: 'doc.pdf', page_range: '' });

    await expect(failure).rejects.toThrow(`Failed to write split images to ${splitDir}`);
    await expect(failure).rejects.not.toThrow(/moved or deleted/);
  });
});
