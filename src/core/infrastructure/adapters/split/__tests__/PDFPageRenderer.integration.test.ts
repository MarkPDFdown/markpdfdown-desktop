import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { ImagePathUtil } from '../ImagePathUtil.js';

const require = createRequire(import.meta.url);
const { SAMPLE_PDF, findRenderProblems } = require('../../../../../../scripts/fixtures/pdf-render-check.cjs');

/**
 * The real pdf-to-png-converter and pdf.js, started from a directory without a node_modules like
 * the installed app (#85). Nothing may load the converter statically: it reads the cwd when it
 * loads, so everything that reaches it is imported after the chdir below.
 */
describe('PDF rendering from a cwd without pdfjs-dist', () => {
  const TASK_ID = 'task-1';
  const originalCwd = process.cwd();

  let workDir: string;
  let uploadsDir: string;
  let splitter: { split: (task: { id: string; filename: string; page_range: string }) => Promise<any> };

  beforeAll(async () => {
    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-render-cwd-')));
    uploadsDir = path.join(workDir, 'userData', 'files');
    await fs.mkdir(path.join(uploadsDir, TASK_ID), { recursive: true });
    await fs.copyFile(SAMPLE_PDF, path.join(uploadsDir, TASK_ID, 'sample.pdf'));
    process.chdir(workDir);

    // Without this situation the test below would prove nothing. Should a new version of the
    // converter fail here, it stopped using the cwd and PDFPageRenderer may be able to go.
    const { DOCUMENT_INIT_PARAMS_DEFAULTS } = await import('pdf-to-png-converter/out/const.js');
    expect(DOCUMENT_INIT_PARAMS_DEFAULTS.cMapUrl).toContain(workDir);

    const { PDFSplitter } = await import('../PDFSplitter.js');
    ImagePathUtil.init(uploadsDir);
    splitter = new PDFSplitter(uploadsDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    ImagePathUtil.reset();
    process.chdir(originalCwd);
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('should draw predefined CMap, Identity-H and standard font text', { timeout: 60_000 }, async () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args.join(' '));
    });

    const { pages } = await splitter.split({ id: TASK_ID, filename: 'sample.pdf', page_range: '' });

    const pngs = await Promise.all(pages.map((page: { imagePath: string }) => fs.readFile(page.imagePath)));
    expect(await findRenderProblems(pngs, warnings, sharp)).toEqual([]);
  });
});
