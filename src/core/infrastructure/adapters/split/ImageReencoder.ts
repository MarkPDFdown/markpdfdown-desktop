import { createCanvas, loadImage } from '@napi-rs/canvas';

// The default of sharp, which encoded these images until it had to go (see AGENTS.md).
const LOSSY_QUALITY = 80;
const JPEG_END = Buffer.from([0xff, 0xd9]);

/**
 * Where an image's metadata may be: Exif (JPEG APP1, PNG eXIf, WebP EXIF), XMP, IPTC, PNG text.
 * Plain bytes, so a chance match in pixel data is possible and only costs a needless re-encode.
 */
const METADATA_MARKERS = ['Exif', 'eXIf', 'EXIF', 'XMP ', 'xpacket', 'Photoshop 3.0', 'tEXt', 'iTXt', 'zTXt'];

function isJpeg(image: Buffer): boolean {
  return image[0] === 0xff && image[1] === 0xd8;
}

function isWebp(image: Buffer): boolean {
  return image.toString('latin1', 0, 4) === 'RIFF' && image.toString('latin1', 8, 12) === 'WEBP';
}

function isPng(image: Buffer): boolean {
  return image.toString('latin1', 1, 4) === 'PNG';
}

/** Skips to the image data first: the end marker may also be that of a thumbnail in the Exif. */
function jpegHasEnd(image: Buffer): boolean {
  const START_OF_SCAN = 0xda;
  let offset = 2;
  while (offset + 4 <= image.length && image[offset] === 0xff) {
    if (image[offset + 1] === START_OF_SCAN) return image.indexOf(JPEG_END, offset) !== -1;
    offset += 2 + image.readUInt16BE(offset + 2);
  }
  return false;
}

function pngHasEnd(image: Buffer): boolean {
  let offset = 8;
  while (offset + 8 <= image.length) {
    if (image.toString('latin1', offset + 4, offset + 8) === 'IEND') return true;
    offset += 12 + image.readUInt32BE(offset);
  }
  return false;
}

function isTruncated(image: Buffer): boolean {
  if (isJpeg(image)) return !jpegHasEnd(image);
  if (isPng(image)) return !pngHasEnd(image);
  if (isWebp(image)) return image.length < image.readUInt32LE(4) + 8;
  return false;
}

/**
 * Decodes an image and encodes its pixels again, which leaves its metadata (GPS position, device,
 * ...) behind and brings an oversized photo down to a normal size. An Exif orientation is applied
 * to the pixels first, so that the image stays upright without it.
 *
 * Keeps the format of the content, whatever the file is called. PNG is the fallback since it's
 * lossless and keeps transparency.
 *
 * @throws Error if the image is truncated or can't be decoded. Callers must not fall back to the
 *   original.
 */
export async function reencodeImage(source: Buffer): Promise<Buffer> {
  // The decoder would draw what's there and leave the rest blank, and a page that silently lost
  // its lower half would still convert.
  if (isTruncated(source)) throw new Error('The image file is truncated');

  const image = await loadImage(source);
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);

  if (isJpeg(source)) return canvas.encode('jpeg', LOSSY_QUALITY);
  if (isWebp(source)) return canvas.encode('webp', LOSSY_QUALITY);
  return canvas.encode('png');
}

/** Whether an image has to go through reencodeImage before it may leave the machine. */
export function mayHoldMetadata(image: Buffer): boolean {
  return METADATA_MARKERS.some((marker) => image.includes(marker));
}
