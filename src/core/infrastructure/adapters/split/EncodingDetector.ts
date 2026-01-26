import chardet from 'chardet';
import iconv from 'iconv-lite';

/**
 * Supported character encodings for CSV files.
 */
export type SupportedEncoding = 'utf-8' | 'gbk' | 'gb2312' | 'gb18030';

/**
 * File encoding detector and converter.
 *
 * Detects the character encoding of a buffer and converts it to UTF-8.
 * Primarily used for handling CSV files with various encodings.
 */
export class EncodingDetector {
  /**
   * Detect the encoding of a buffer.
   *
   * @param buffer - Buffer to analyze
   * @returns Detected encoding (defaults to utf-8 if unknown)
   */
  static detect(buffer: Buffer): SupportedEncoding {
    const detected = chardet.detect(buffer);

    if (!detected) {
      return 'utf-8';
    }

    const normalized = detected.toLowerCase().replace(/-/g, '');

    if (normalized.includes('utf8') || normalized.includes('ascii')) {
      return 'utf-8';
    }
    if (normalized.includes('gb18030')) {
      return 'gb18030';
    }
    if (normalized.includes('gbk') || normalized.includes('gb2312')) {
      return 'gbk';
    }

    return 'utf-8';
  }

  /**
   * Convert a buffer to a UTF-8 string.
   *
   * Automatically detects the source encoding and converts if necessary.
   *
   * @param buffer - Buffer to convert
   * @returns UTF-8 encoded string
   */
  static toUtf8String(buffer: Buffer): string {
    const encoding = this.detect(buffer);

    if (encoding === 'utf-8') {
      return buffer.toString('utf-8');
    }

    return iconv.decode(buffer, encoding);
  }
}
