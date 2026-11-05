/**
 * Tells whether a decoded image holds what was drawn. Shared by scripts/package-load-check.cjs and
 * tests, which have to pass the @napi-rs/canvas they mean to check: the packaged app has its own.
 *
 * @param {Buffer} image an encoded image, flattened onto white when transparent
 * @param {object} canvasModule the @napi-rs/canvas module
 * @returns {Promise<{ width: number, dark: number }>} its width and how many of its pixels are dark
 */
async function countDarkPixels(image, canvasModule) {
  const decoded = await canvasModule.loadImage(image);
  const { width, height } = decoded;
  const context = canvasModule.createCanvas(width, height).getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(decoded, 0, 0);

  const { data } = context.getImageData(0, 0, width, height);
  let dark = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    if (luminance < 128) dark++;
  }
  return { width, dark };
}

module.exports = { countDarkPixels };
