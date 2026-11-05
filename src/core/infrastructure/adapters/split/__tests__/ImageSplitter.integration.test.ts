import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as canvasModule from '@napi-rs/canvas';
import { promises as fs } from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { ImageSplitter } from '../ImageSplitter.js';
import modelService from '../../../../application/services/ModelService.js';

vi.mock('../../../../domain/repositories/ProviderRepository.js', () => ({ default: {} }));
vi.mock('../../../llm/LLMClient.js', () => ({ LLMClientFactory: {} }));

const require = createRequire(import.meta.url);
const { countDarkPixels } = require('../../../../../../scripts/fixtures/count-dark-pixels.cjs');

/** What must never reach a provider: it stands for the device and GPS position in real files. */
const SECRET = 'LeakyCam GPS 39.9075N 116.3916E';
const ORIENTATION_ROTATE_90 = 6;

/** A little-endian TIFF, as Exif is, with the camera make and optionally an orientation. */
function exifBody(orientation?: number): Buffer {
  const tags = orientation ? 2 : 1;
  const valueOffset = 8 + 2 + tags * 12 + 4;
  const ifd = Buffer.alloc(valueOffset);
  ifd.write('II', 0, 'latin1');
  ifd.writeUInt16LE(42, 2);
  ifd.writeUInt32LE(8, 4);
  ifd.writeUInt16LE(tags, 8);
  ifd.writeUInt16LE(0x010f, 10); // Make
  ifd.writeUInt16LE(2, 12); // ASCII
  ifd.writeUInt32LE(SECRET.length + 1, 14);
  ifd.writeUInt32LE(valueOffset, 18);
  if (orientation) {
    ifd.writeUInt16LE(0x0112, 22); // Orientation
    ifd.writeUInt16LE(3, 24); // SHORT
    ifd.writeUInt32LE(1, 26);
    ifd.writeUInt16LE(orientation, 30);
  }
  return Buffer.concat([ifd, Buffer.from(`${SECRET}\0`, 'latin1')]);
}

function withJpegExif(jpeg: Buffer, orientation?: number): Buffer {
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifBody(orientation)]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(app1.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, app1, jpeg.subarray(2)]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function withPngExif(png: Buffer): Buffer {
  const afterIhdr = 8 + 25;
  return Buffer.concat([
    png.subarray(0, afterIhdr),
    pngChunk('eXIf', exifBody()),
    pngChunk('tEXt', Buffer.from(`Comment\0${SECRET}`, 'latin1')),
    png.subarray(afterIhdr),
  ]);
}

/** Our WebP encoder writes a VP8X container, so this only has to flag and append the chunk. */
function withWebpExif(webp: Buffer): Buffer {
  expect(webp.toString('latin1', 12, 16)).toBe('VP8X');
  const body = exifBody();
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write('EXIF', 0, 'latin1');
  chunkHeader.writeUInt32LE(body.length, 4);
  const padding = Buffer.alloc(body.length % 2);
  const result = Buffer.concat([webp, chunkHeader, body, padding]);
  result[20] |= 0x08; // VP8X: has an EXIF chunk
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

/** White with a black left half, so that lost or misplaced pixels show. */
function halfBlackCanvas(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000';
  context.fillRect(0, 0, width / 2, height);
  return canvas;
}

/** Fine detail, which is what makes a high quality JPEG as large as a real photo. */
function detailedCanvas(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(width, height);
  let seed = 1;
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    pixels.data[offset] = seed >>> 24;
    pixels.data[offset + 1] = (seed >>> 16) & 0xff;
    pixels.data[offset + 2] = (seed >>> 8) & 0xff;
    pixels.data[offset + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * The real splitter, canvas and message building, from the uploaded file to the request payload:
 * this payload is what the model provider receives.
 */
describe('Image metadata on the way to the provider', () => {
  const TASK_ID = 'task-1';
  let uploadsDir: string;

  const upload = async (filename: string, content: Buffer) => {
    await fs.mkdir(path.join(uploadsDir, TASK_ID), { recursive: true });
    await fs.writeFile(path.join(uploadsDir, TASK_ID, filename), content);
  };

  const payloadOf = async (imagePath: string): Promise<Buffer> => {
    const messages = await modelService.transformImageMessage(imagePath);
    const url = (messages[1].content as { image_url?: { url: string } }[])[1].image_url!.url;
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };

  const splitAndSend = async (filename: string, content: Buffer): Promise<Buffer> => {
    await upload(filename, content);
    const { pages } = await new ImageSplitter(uploadsDir).split({ id: TASK_ID, filename });
    return payloadOf(pages[0].imagePath);
  };

  const expectNoMetadata = (image: Buffer) => {
    for (const marker of ['Exif', 'eXIf', 'EXIF', 'tEXt', SECRET]) {
      expect(image.includes(marker), `payload holds "${marker}"`).toBe(false);
    }
  };

  beforeEach(async () => {
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-splitter-'));
    ImagePathUtil.init(uploadsDir);
  });

  afterEach(async () => {
    ImagePathUtil.reset();
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  it('should drop the APP1 Exif of a JPEG and keep its pixels', async () => {
    const original = withJpegExif(await halfBlackCanvas(200, 100).encode('jpeg', 95));
    expect(original.includes(SECRET)).toBe(true);

    const payload = await splitAndSend('photo.jpg', original);

    expectNoMetadata(payload);
    expect(payload.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const { width, dark } = await countDarkPixels(payload, canvasModule);
    expect(width).toBe(200);
    expect(dark).toBeGreaterThan(200 * 100 * 0.45);
    expect(dark).toBeLessThan(200 * 100 * 0.55);
  });

  it('should drop the eXIf and text chunks of a PNG and keep it lossless', async () => {
    const original = withPngExif(await halfBlackCanvas(200, 100).encode('png'));
    expect((await loadImage(original)).width).toBe(200);
    expect(original.includes('eXIf')).toBe(true);

    const payload = await splitAndSend('screenshot.png', original);

    expectNoMetadata(payload);
    expect(payload.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(await countDarkPixels(payload, canvasModule)).toEqual({ width: 200, dark: 100 * 100 });
  });

  it('should drop the EXIF chunk of a WebP', async () => {
    const original = withWebpExif(await halfBlackCanvas(200, 100).encode('webp', 95));
    expect((await loadImage(original)).width).toBe(200);

    const payload = await splitAndSend('photo.webp', original);

    expectNoMetadata(payload);
    expect(payload.toString('latin1', 8, 12)).toBe('WEBP');
  });

  it('should apply the Exif orientation, which is about to be lost, to the pixels', async () => {
    const original = withJpegExif(await halfBlackCanvas(400, 200).encode('jpeg', 95), ORIENTATION_ROTATE_90);

    const payload = await splitAndSend('portrait.jpg', original);

    const decoded = await loadImage(payload);
    expect([decoded.width, decoded.height]).toEqual([200, 400]);
    expectNoMetadata(payload);
  });

  it('should go by the content rather than the file name', async () => {
    const jpegNamedPng = withJpegExif(await halfBlackCanvas(20, 10).encode('jpeg', 95));

    const payload = await splitAndSend('mislabeled.png', jpegNamedPng);

    expect(payload.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expectNoMetadata(payload);
  });

  it('should keep the transparency of a PNG', async () => {
    const canvas = createCanvas(10, 10);
    canvas.getContext('2d').fillRect(0, 0, 5, 10);

    const payload = await splitAndSend('transparent.png', await canvas.encode('png'));

    const decoded = await loadImage(payload);
    const context = createCanvas(10, 10).getContext('2d');
    context.drawImage(decoded, 0, 0);
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255);
    expect(context.getImageData(9, 0, 1, 1).data[3]).toBe(0);
  });

  it('should bring a high quality photo down to a normal size', async () => {
    const original = await detailedCanvas(800, 600).encode('jpeg', 97);

    const payload = await splitAndSend('large.jpg', original);

    expect(payload.length).toBeLessThan(original.length * 0.7);
  });

  /** Large enough for the decoder to get going, where it draws what's there instead of failing. */
  const cutInHalf = (image: Buffer) => image.subarray(0, image.length >> 1);

  it.each([
    ['garbage', async () => Buffer.from('not an image')],
    ['a JPEG cut off in its header', async () => (await halfBlackCanvas(300, 200).encode('jpeg', 80)).subarray(0, 100)],
    ['a WebP cut off in its header', async () => (await halfBlackCanvas(300, 200).encode('webp', 80)).subarray(0, 100)],
    ['a PNG cut off in its header', async () => (await halfBlackCanvas(300, 200).encode('png')).subarray(0, 10)],
    ['a truncated JPEG', async () => cutInHalf(await detailedCanvas(800, 600).encode('jpeg', 90))],
    ['a truncated PNG', async () => cutInHalf(await detailedCanvas(800, 600).encode('png'))],
    ['a truncated WebP', async () => cutInHalf(await detailedCanvas(800, 600).encode('webp', 90))],
  ])('should fail on %s without writing a page or crashing the process', async (_name, content) => {
    await upload('broken.jpg', await content());

    await expect(new ImageSplitter(uploadsDir).split({ id: TASK_ID, filename: 'broken.jpg' })).rejects.toThrow(
      /Failed to process image broken\.jpg/,
    );

    await expect(fs.access(ImagePathUtil.getPath(TASK_ID, 1))).rejects.toThrow();
  });

  it('should not take the end of a thumbnail in the Exif for the end of a truncated JPEG', async () => {
    const jpeg = withJpegExif(await detailedCanvas(800, 600).encode('jpeg', 90));
    const thumbnailEnd = Buffer.from([0xff, 0xd9]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 8]), Buffer.from('Thmb'), thumbnailEnd]);
    const original = cutInHalf(Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]));
    expect(original.includes(thumbnailEnd)).toBe(true);

    await upload('broken.jpg', original);

    await expect(new ImageSplitter(uploadsDir).split({ id: TASK_ID, filename: 'broken.jpg' })).rejects.toThrow(
      /truncated/,
    );
  });

  it('should accept a complete JPEG followed by the trailer some cameras add', async () => {
    const original = Buffer.concat([await halfBlackCanvas(200, 100).encode('jpeg', 95), Buffer.from('trailer')]);

    const payload = await splitAndSend('camera.jpg', original);

    expect((await loadImage(payload)).width).toBe(200);
  });

  describe('a page file that was not split by this version', () => {
    const writePage = async (content: Buffer) => {
      const pagePath = ImagePathUtil.getPath(TASK_ID, 1);
      await fs.mkdir(path.dirname(pagePath), { recursive: true });
      await fs.writeFile(pagePath, content);
      return pagePath;
    };

    it('should strip a copy of the upload, which is what retrying an older task sends', async () => {
      const raw = withJpegExif(await halfBlackCanvas(200, 100).encode('jpeg', 95));

      expectNoMetadata(await payloadOf(await writePage(raw)));
    });

    it('should strip an old copy of a PNG too', async () => {
      const raw = withPngExif(await halfBlackCanvas(200, 100).encode('png'));

      expectNoMetadata(await payloadOf(await writePage(raw)));
    });

    it('should send a page without metadata unchanged, as those of PDFs are', async () => {
      const clean = await halfBlackCanvas(200, 100).encode('png');

      expect(await payloadOf(await writePage(clean))).toEqual(clean);
    });
  });
});
