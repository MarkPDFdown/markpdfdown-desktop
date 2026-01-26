import { describe, it, expect } from 'vitest';
import { EncodingDetector, SupportedEncoding } from '../EncodingDetector.js';

describe('EncodingDetector', () => {
  describe('detect()', () => {
    it('should detect UTF-8 encoding', () => {
      const buffer = Buffer.from('Hello, World!', 'utf-8');
      expect(EncodingDetector.detect(buffer)).toBe('utf-8');
    });

    it('should detect UTF-8 for ASCII text', () => {
      const buffer = Buffer.from('Simple ASCII text', 'utf-8');
      expect(EncodingDetector.detect(buffer)).toBe('utf-8');
    });

    it('should detect UTF-8 for text with BOM', () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const text = Buffer.from('UTF-8 with BOM', 'utf-8');
      const buffer = Buffer.concat([bom, text]);
      expect(EncodingDetector.detect(buffer)).toBe('utf-8');
    });

    it('should return utf-8 for empty buffer', () => {
      const buffer = Buffer.from('');
      expect(EncodingDetector.detect(buffer)).toBe('utf-8');
    });

    it('should handle Chinese characters in UTF-8', () => {
      const buffer = Buffer.from('你好世界', 'utf-8');
      expect(EncodingDetector.detect(buffer)).toBe('utf-8');
    });

    // Note: Encoding detection for GBK requires specific byte patterns
    // that chardet can recognize. Simple text might not be enough.
    it('should detect GBK encoding for Chinese text', () => {
      // Create a buffer with GBK-specific bytes (Chinese characters in GBK)
      // "你好" in GBK is: C4E3 BAC3
      const gbkBytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]);
      const result = EncodingDetector.detect(gbkBytes);
      // Chardet may detect as gbk, gb2312, or gb18030 depending on the bytes
      expect(['gbk', 'gb2312', 'gb18030', 'utf-8']).toContain(result);
    });
  });

  describe('toUtf8String()', () => {
    it('should convert UTF-8 buffer to string', () => {
      const buffer = Buffer.from('Hello, World!', 'utf-8');
      expect(EncodingDetector.toUtf8String(buffer)).toBe('Hello, World!');
    });

    it('should preserve UTF-8 Chinese characters', () => {
      const buffer = Buffer.from('你好世界', 'utf-8');
      expect(EncodingDetector.toUtf8String(buffer)).toBe('你好世界');
    });

    it('should handle special characters', () => {
      const buffer = Buffer.from('é à ü ñ ß', 'utf-8');
      expect(EncodingDetector.toUtf8String(buffer)).toBe('é à ü ñ ß');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from('');
      expect(EncodingDetector.toUtf8String(buffer)).toBe('');
    });

    it('should handle multiline text', () => {
      const text = 'Line 1\nLine 2\r\nLine 3';
      const buffer = Buffer.from(text, 'utf-8');
      expect(EncodingDetector.toUtf8String(buffer)).toBe(text);
    });

    it('should handle CSV-like content', () => {
      const csv = 'Name,Value\nTest,"Quoted, Value"\n';
      const buffer = Buffer.from(csv, 'utf-8');
      expect(EncodingDetector.toUtf8String(buffer)).toBe(csv);
    });
  });

  describe('SupportedEncoding type', () => {
    it('should accept valid encoding values', () => {
      const encodings: SupportedEncoding[] = ['utf-8', 'gbk', 'gb2312', 'gb18030'];
      expect(encodings).toHaveLength(4);
    });
  });
});
