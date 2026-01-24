import { describe, it, expect } from 'vitest';
import { PageRangeParser } from '../PageRangeParser.js';

describe('PageRangeParser', () => {
  describe('parse()', () => {
    it('should return all pages for empty string', () => {
      const result = PageRangeParser.parse('', 5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return all pages for null', () => {
      const result = PageRangeParser.parse(null, 5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return all pages for undefined', () => {
      const result = PageRangeParser.parse(undefined, 5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return all pages for whitespace only', () => {
      const result = PageRangeParser.parse('   ', 5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse single page', () => {
      const result = PageRangeParser.parse('3', 10);
      expect(result).toEqual([3]);
    });

    it('should parse simple range', () => {
      const result = PageRangeParser.parse('2-5', 10);
      expect(result).toEqual([2, 3, 4, 5]);
    });

    it('should parse multiple single pages', () => {
      const result = PageRangeParser.parse('1,3,5', 10);
      expect(result).toEqual([1, 3, 5]);
    });

    it('should parse mixed format', () => {
      const result = PageRangeParser.parse('1-3,5,7-9', 10);
      expect(result).toEqual([1, 2, 3, 5, 7, 8, 9]);
    });

    it('should handle duplicates (deduplicate)', () => {
      const result = PageRangeParser.parse('1,2,2,3,3,3', 10);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle overlapping ranges', () => {
      const result = PageRangeParser.parse('1-5,3-7', 10);
      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should sort pages in ascending order', () => {
      const result = PageRangeParser.parse('5,1,3,2,4', 10);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle range with same start and end', () => {
      const result = PageRangeParser.parse('3-3', 10);
      expect(result).toEqual([3]);
    });

    it('should handle whitespace around values', () => {
      const result = PageRangeParser.parse(' 1 - 3 , 5 ', 10);
      expect(result).toEqual([1, 2, 3, 5]);
    });

    it('should parse complex mixed format (user requested format)', () => {
      const result = PageRangeParser.parse('1-3,7,9,10-20', 25);
      expect(result).toEqual([1, 2, 3, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    });

    it('should parse complex mixed format with many components', () => {
      const result = PageRangeParser.parse('1-2,5,8-10,15,20-22', 25);
      expect(result).toEqual([1, 2, 5, 8, 9, 10, 15, 20, 21, 22]);
    });

    it('should handle mixed format with unordered components', () => {
      const result = PageRangeParser.parse('10-12,1-3,7,5', 15);
      expect(result).toEqual([1, 2, 3, 5, 7, 10, 11, 12]);
    });
  });

  describe('parse() - error cases', () => {
    it('should throw error for invalid format (letters)', () => {
      expect(() => PageRangeParser.parse('abc', 10)).toThrow(/Invalid page range format/);
    });

    it('should throw error for invalid format (special chars)', () => {
      expect(() => PageRangeParser.parse('1@3', 10)).toThrow(/Invalid page range format/);
    });

    it('should throw error for invalid format (missing end in range)', () => {
      expect(() => PageRangeParser.parse('1-', 10)).toThrow(/Invalid page range format/);
    });

    it('should throw error for invalid format (missing start in range)', () => {
      expect(() => PageRangeParser.parse('-5', 10)).toThrow(/Invalid page range format/);
    });

    it('should throw error for invalid format (double dash)', () => {
      expect(() => PageRangeParser.parse('1--5', 10)).toThrow(/Invalid page range format/);
    });

    it('should throw error for inverted range', () => {
      expect(() => PageRangeParser.parse('5-2', 10)).toThrow(
        /Start page must be less than or equal to end page/
      );
    });

    it('should throw error for negative page', () => {
      expect(() => PageRangeParser.parse('-1', 10)).toThrow(/Invalid page range format/);
    });

    it('should throw error when no valid pages found', () => {
      expect(() => PageRangeParser.parse('15-20', 10)).toThrow(/No valid pages found/);
    });
  });

  describe('parse() - clamping behavior', () => {
    it('should clamp single page above bounds and skip it', () => {
      // Page 11 is out of bounds for 10-page document, should throw
      expect(() => PageRangeParser.parse('11', 10)).toThrow(/No valid pages found/);
    });

    it('should clamp single page below bounds and skip it', () => {
      // Page 0 is out of bounds and gets skipped, resulting in no valid pages
      expect(() => PageRangeParser.parse('0', 10)).toThrow(/No valid pages found/);
    });

    it('should clamp range that exceeds upper bound', () => {
      // Requesting pages 5-15 but only 10 pages exist, should clamp to 5-10
      const result = PageRangeParser.parse('5-15', 10);
      expect(result).toEqual([5, 6, 7, 8, 9, 10]);
    });

    it('should clamp range that exceeds upper bound (user issue case)', () => {
      // Requesting pages 1-3 but only 1 page exists, should clamp to page 1
      const result = PageRangeParser.parse('1-3', 1);
      expect(result).toEqual([1]);
    });

    it('should skip pages above bounds in mixed format', () => {
      // Pages 1,2,3 are valid, but 15 is out of bounds
      const result = PageRangeParser.parse('1,2,3,15', 10);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should clamp range and skip out-of-bounds pages in mixed format', () => {
      // 1-3 is valid, 8-12 should clamp to 8-10, 20 should be skipped
      const result = PageRangeParser.parse('1-3,8-12,20', 10);
      expect(result).toEqual([1, 2, 3, 8, 9, 10]);
    });

    it('should skip range entirely above bounds', () => {
      // All pages are out of bounds
      expect(() => PageRangeParser.parse('20-25', 10)).toThrow(/No valid pages found/);
    });

    it('should handle complex mixed format with clamping (user scenario)', () => {
      // Simulate "1-3,7,9,10-20" on a 15-page document
      // Pages 1-3, 7, 9 are valid; 10-20 should clamp to 10-15
      const result = PageRangeParser.parse('1-3,7,9,10-20', 15);
      expect(result).toEqual([1, 2, 3, 7, 9, 10, 11, 12, 13, 14, 15]);
    });

    it('should handle complex mixed format with some out of bounds components', () => {
      // 1-3 valid, 7 valid, 9 valid, 10-20 clamped to 10-12, 25 skipped, 30-35 skipped
      const result = PageRangeParser.parse('1-3,7,9,10-20,25,30-35', 12);
      expect(result).toEqual([1, 2, 3, 7, 9, 10, 11, 12]);
    });

    it('should handle mixed format where first part is out of bounds', () => {
      // 20-25 out of bounds (skipped), 1-3 valid, 5 valid
      const result = PageRangeParser.parse('20-25,1-3,5', 10);
      expect(result).toEqual([1, 2, 3, 5]);
    });

    it('should handle mixed format with alternating valid/invalid parts', () => {
      // 1-2 valid, 100 skip, 5-7 valid, 200-300 skip, 9 valid
      const result = PageRangeParser.parse('1-2,100,5-7,200-300,9', 10);
      expect(result).toEqual([1, 2, 5, 6, 7, 9]);
    });

    it('should handle complex mixed format on 1-page document (extreme case)', () => {
      // Only page 1 is valid; 1-3 clamped to 1, 7 skipped, 9 skipped, 10-20 skipped
      const result = PageRangeParser.parse('1-3,7,9,10-20', 1);
      expect(result).toEqual([1]);
    });

    it('should throw when all components in mixed format are out of bounds', () => {
      // All parts are out of bounds
      expect(() => PageRangeParser.parse('20-25,30,35-40', 10)).toThrow(/No valid pages found/);
    });
  });

  describe('validate()', () => {
    it('should validate empty string', () => {
      expect(PageRangeParser.validate('')).toBe(true);
    });

    it('should validate null', () => {
      expect(PageRangeParser.validate(null)).toBe(true);
    });

    it('should validate undefined', () => {
      expect(PageRangeParser.validate(undefined)).toBe(true);
    });

    it('should validate whitespace', () => {
      expect(PageRangeParser.validate('   ')).toBe(true);
    });

    it('should validate single page', () => {
      expect(PageRangeParser.validate('5')).toBe(true);
    });

    it('should validate simple range', () => {
      expect(PageRangeParser.validate('1-5')).toBe(true);
    });

    it('should validate multiple pages', () => {
      expect(PageRangeParser.validate('1,3,5')).toBe(true);
    });

    it('should validate mixed format', () => {
      expect(PageRangeParser.validate('1-3,5,7-9')).toBe(true);
    });

    it('should invalidate letters', () => {
      expect(PageRangeParser.validate('abc')).toBe(false);
    });

    it('should invalidate special characters', () => {
      expect(PageRangeParser.validate('1@3')).toBe(false);
    });

    it('should invalidate incomplete range (missing end)', () => {
      expect(PageRangeParser.validate('1-')).toBe(false);
    });

    it('should invalidate incomplete range (missing start)', () => {
      expect(PageRangeParser.validate('-5')).toBe(false);
    });

    it('should invalidate double dash', () => {
      expect(PageRangeParser.validate('1--5')).toBe(false);
    });

    it('should invalidate trailing comma', () => {
      expect(PageRangeParser.validate('1,3,')).toBe(false);
    });

    it('should invalidate leading comma', () => {
      expect(PageRangeParser.validate(',1,3')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle totalPages = 1', () => {
      const result = PageRangeParser.parse('1', 1);
      expect(result).toEqual([1]);
    });

    it('should handle totalPages = 1 with empty range', () => {
      const result = PageRangeParser.parse('', 1);
      expect(result).toEqual([1]);
    });

    it('should handle large page numbers', () => {
      const result = PageRangeParser.parse('998-1000', 1000);
      expect(result).toEqual([998, 999, 1000]);
    });

    it('should handle many individual pages', () => {
      const result = PageRangeParser.parse('1,2,3,4,5,6,7,8,9,10', 20);
      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });
});
