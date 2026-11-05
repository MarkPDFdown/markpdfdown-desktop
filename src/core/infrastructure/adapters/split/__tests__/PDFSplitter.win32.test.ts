import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Run the path logic of the modules under test with Windows semantics on any host OS.
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return { ...actual.win32, default: actual.win32 };
});

vi.mock('../PDFPageRenderer.js', () => ({
  renderPdfPages: vi.fn(),
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(),
  },
}));

vi.mock('../FileWaitUtil.js', () => ({
  FileWaitUtil: {
    waitForFile: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    readFile: vi.fn(),
  },
}));

import { promises as fs } from 'fs';
import path from 'path';
import { renderPdfPages } from '../PDFPageRenderer.js';
import { PDFDocument } from 'pdf-lib';
import { PDFSplitter } from '../PDFSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';

const USER_DATA_FILES = 'C:\\Users\\u\\AppData\\Roaming\\MarkPDFdown\\files';
const NON_SYSTEM_DRIVE_CWD = 'D:\\Apps\\MarkPDFdown';
const TASK_ID = 'task-1';

function systemError(code: string, syscall: string, target: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: ${syscall} '${target}'`), { code, syscall, path: target });
}

/**
 * Minimal Windows file system: ':' is illegal after the root, and libuv reports
 * the resulting ERROR_INVALID_NAME as ENOENT.
 */
class FakeWindowsFs {
  readonly dirs = new Set<string>();
  readonly files = new Map<string, Buffer>();

  private assertValidName(target: string, syscall: string): void {
    if (target.slice(path.parse(target).root.length).includes(':')) {
      throw systemError('ENOENT', syscall, target);
    }
  }

  mkdir = async (target: string): Promise<undefined> => {
    this.assertValidName(target, 'mkdir');
    this.dirs.add(target);
    return undefined;
  };

  writeFile = async (target: string, content: Buffer): Promise<void> => {
    this.assertValidName(target, 'open');
    this.files.set(target, content);
  };

  rename = async (from: string, to: string): Promise<void> => {
    if (path.parse(from).root.toLowerCase() !== path.parse(to).root.toLowerCase()) {
      throw systemError('EXDEV', 'rename', from);
    }
    this.files.set(to, this.files.get(from)!);
    this.files.delete(from);
  };

  /** Every directory and file the code under test created below `dir`. */
  entriesUnder(dir: string): string[] {
    const prefix = `${dir.toLowerCase()}\\`;
    return [...this.dirs, ...this.files.keys()].filter((entry) =>
      entry.toLowerCase().startsWith(prefix)
    );
  }
}

/** Same output handling as pdf-to-png-converter 3.11.0 (out/pdfToPng.js). */
function fakePdfToPng(pageCount: number): typeof renderPdfPages {
  return (async (_pdf: unknown, props?: { outputFolder?: string }) => {
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      name: `doc_page_${i + 1}.png`,
      content: Buffer.from(`png-${i + 1}`),
      path: '',
      width: 100,
      height: 100,
    }));

    if (props?.outputFolder !== undefined) {
      const outputFolder = path.join(process.cwd(), props.outputFolder);
      await fs.mkdir(outputFolder, { recursive: true });
      for (const page of pages) {
        page.path = path.join(outputFolder, page.name);
        await fs.writeFile(page.path, page.content);
      }
    }

    return pages;
  }) as unknown as typeof renderPdfPages;
}

describe('PDFSplitter output location on Windows', () => {
  let fakeFs: FakeWindowsFs;

  async function splitTwoPages(uploadsDir: string, cwd: string) {
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    ImagePathUtil.init(uploadsDir);

    const splitter = new PDFSplitter(uploadsDir);
    vi.spyOn(splitter as any, 'sleep').mockResolvedValue(undefined);

    return splitter.split({ id: TASK_ID, filename: 'doc.pdf', page_range: '' });
  }

  beforeEach(() => {
    fakeFs = new FakeWindowsFs();

    vi.mocked(fs.mkdir).mockImplementation(fakeFs.mkdir as any);
    vi.mocked(fs.writeFile).mockImplementation(fakeFs.writeFile as any);
    vi.mocked(fs.rename).mockImplementation(fakeFs.rename as any);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('pdf-bytes'));
    vi.mocked(PDFDocument.load).mockResolvedValue({ getPageCount: () => 2 } as any);
    vi.mocked(renderPdfPages).mockImplementation(fakePdfToPng(2));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    ImagePathUtil.reset();
    vi.restoreAllMocks();
  });

  it.each([
    {
      scenario: 'cwd on a different drive than userData',
      uploadsDir: USER_DATA_FILES,
      cwd: NON_SYSTEM_DRIVE_CWD,
    },
    {
      scenario: 'userData on a UNC share',
      uploadsDir: '\\\\server\\share\\MarkPDFdown\\files',
      cwd: NON_SYSTEM_DRIVE_CWD,
    },
    {
      scenario: 'cwd on the same drive as userData',
      uploadsDir: USER_DATA_FILES,
      cwd: 'C:\\Program Files\\MarkPDFdown',
    },
  ])('should write page images only to the task split dir with $scenario', async ({ uploadsDir, cwd }) => {
    const result = await splitTwoPages(uploadsDir, cwd);

    const splitDir = `${uploadsDir}\\${TASK_ID}\\split`;
    const expectedPaths = [`${splitDir}\\page-1.png`, `${splitDir}\\page-2.png`];

    expect(result.pages.map((page) => page.imagePath)).toEqual(expectedPaths);
    expect([...fakeFs.files.keys()].sort()).toEqual(expectedPaths);
    expect(fakeFs.files.get(expectedPaths[0])?.toString()).toBe('png-1');
    expect(fakeFs.files.get(expectedPaths[1])?.toString()).toBe('png-2');
    expect(fakeFs.entriesUnder(cwd)).toEqual([]);
  });
});
