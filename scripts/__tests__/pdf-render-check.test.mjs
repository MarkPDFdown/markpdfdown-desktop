import * as canvasModule from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { findRenderProblems } = require('../fixtures/pdf-render-check.cjs');

const JPX_PAGE = 5;

const pagePng = (color) => {
  const canvas = canvasModule.createCanvas(400, 200);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 400, 200);
  return canvas.encode('png');
};

describe('findRenderProblems', () => {
  const allDrawn = async () => Promise.all(Array.from({ length: 6 }, () => pagePng('#000')));

  it('accepts a complete rendering', async () => {
    expect(await findRenderProblems(await allDrawn(), [], canvasModule)).toEqual([]);
  });

  it('reports a page whose JPX image was dropped, which is the only one left blank', async () => {
    const pngs = await allDrawn();
    pngs[JPX_PAGE] = await pagePng('#fff');

    const problems = await findRenderProblems(pngs, [], canvasModule);

    expect(problems).toEqual([expect.stringContaining('Page 6 (JPXDecode image) lost its content: 0 of 38400')]);
  });

  it.each([
    'Warning: JpxImage#instantiateWasm: Error: Unable to load wasm data at: /x/openjpeg.wasm',
    'Warning: JpxImage#instantiateWasm: CompileError: expected magic word',
    'Warning: JpxImage#getJsModule: Error: Cannot find module',
  ])('reports a decoder that failed to load even if the image got drawn: %s', async (warning) => {
    expect(await findRenderProblems(await allDrawn(), [warning], canvasModule)).toEqual([warning]);
  });

  it('ignores warnings unrelated to loading', async () => {
    expect(await findRenderProblems(await allDrawn(), ['Warning: TT: undefined function'], canvasModule)).toEqual([]);
  });
});
