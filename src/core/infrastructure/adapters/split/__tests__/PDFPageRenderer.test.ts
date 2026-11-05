import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';

vi.mock('pdf-to-png-converter', () => ({
  pdfToPng: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, default: actual, existsSync: vi.fn(actual.existsSync) };
});

import { pdfToPng } from 'pdf-to-png-converter';
import { DOCUMENT_INIT_PARAMS_DEFAULTS } from 'pdf-to-png-converter/out/const.js';
import { outsideAsar, renderPdfPages } from '../PDFPageRenderer.js';

describe('renderPdfPages', () => {
  beforeEach(() => {
    vi.mocked(pdfToPng).mockReset();
    vi.mocked(pdfToPng).mockResolvedValue([]);
    vi.mocked(existsSync).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the pdf.js data of the installed package in place before it converts', async () => {
    let urlsSeenByConverter: { cMapUrl?: string; standardFontDataUrl?: string; wasmUrl?: string } = {};
    vi.mocked(pdfToPng).mockImplementation(async () => {
      urlsSeenByConverter = { ...DOCUMENT_INIT_PARAMS_DEFAULTS };
      return [];
    });
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(os.tmpdir(), 'unrelated-cwd'));

    await renderPdfPages('/doc.pdf', {});

    const { cMapUrl, standardFontDataUrl, wasmUrl } = urlsSeenByConverter;
    // The trailing slash is mandatory for pdf.js, which throws without it.
    expect(cMapUrl).toMatch(/pdfjs-dist[\\/]cmaps\/$/);
    expect(standardFontDataUrl).toMatch(/pdfjs-dist[\\/]standard_fonts\/$/);
    expect(wasmUrl).toMatch(/pdfjs-dist[\\/]wasm\/$/);
    expect(path.isAbsolute(cMapUrl!)).toBe(true);
    expect(path.isAbsolute(standardFontDataUrl!)).toBe(true);
    expect(path.isAbsolute(wasmUrl!)).toBe(true);
    // pdf.js builds file paths by appending the name, so that is how they must work.
    expect(readFileSync(`${cMapUrl}UniGB-UCS2-H.bcmap`).length).toBeGreaterThan(0);
    expect(readFileSync(`${standardFontDataUrl}LiberationSans-Regular.ttf`).length).toBeGreaterThan(0);
    expect(readFileSync(`${wasmUrl}openjpeg.wasm`).length).toBeGreaterThan(0);
  });

  it('should pass the options on and turn pdf.js warnings on', async () => {
    await renderPdfPages('/doc.pdf', { viewportScale: 2, pagesToProcess: [3] });

    expect(pdfToPng).toHaveBeenCalledWith('/doc.pdf', {
      verbosityLevel: 1,
      viewportScale: 2,
      pagesToProcess: [3],
    });
  });

  it('should return what the converter returns', async () => {
    const pages = [{ pageNumber: 1, name: 'p1', content: Buffer.from('png'), path: '', width: 1, height: 1 }];
    vi.mocked(pdfToPng).mockResolvedValue(pages);

    await expect(renderPdfPages('/doc.pdf', {})).resolves.toBe(pages);
  });

  it.each([
    ['CMaps', 'UniGB-UCS2-H.bcmap'],
    ['standard fonts', 'LiberationSans-Regular.ttf'],
    ['JPEG2000 decoder', 'openjpeg.wasm'],
  ])('should refuse to render without the %s rather than lose content', async (_label, fileName) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(existsSync).mockImplementation((file) => !String(file).endsWith(fileName));

    await expect(renderPdfPages('/doc.pdf', {})).rejects.toThrow('PDF.js data files are missing');

    expect(pdfToPng).not.toHaveBeenCalled();
    expect(consoleError.mock.calls[0][0]).toContain(fileName);
  });

  it('should keep paths out of the error, whose words PDFSplitter classifies', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(existsSync).mockReturnValue(false);

    const error: Error = await renderPdfPages('/doc.pdf', {}).catch((e) => e);

    expect(error.message).not.toContain('pdfjs-dist');
    expect(error.message).not.toContain(path.sep);
  });
});

describe('outsideAsar', () => {
  it.each([
    ['/opt/MarkPDFdown/resources/app.asar/node_modules/x', '/opt/MarkPDFdown/resources/app.asar.unpacked/node_modules/x'],
    ['C:\\MarkPDFdown\\resources\\app.asar\\node_modules\\x', 'C:\\MarkPDFdown\\resources\\app.asar.unpacked\\node_modules\\x'],
  ])('should turn the path inside the archive into the real one: %s', (inside, outside) => {
    expect(outsideAsar(inside)).toBe(outside);
  });

  it.each([
    ['a development checkout', '/home/me/repo/node_modules/x'],
    ['a path that is already outside', '/res/app.asar.unpacked/node_modules/x'],
    ['a directory that merely ends the same way', '/home/me/myapp.asar/node_modules/x'],
  ])('should leave %s alone', (_label, dir) => {
    expect(outsideAsar(dir)).toBe(dir);
  });
});
