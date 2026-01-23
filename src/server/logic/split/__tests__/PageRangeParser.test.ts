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

    it('should throw error for page out of bounds (below)', () => {
      expect(() => PageRangeParser.parse('0', 10)).toThrow(/out of bounds/);
    });

    it('should throw error for page out of bounds (above)', () => {
      expect(() => PageRangeParser.parse('11', 10)).toThrow(/out of bounds/);
    });

    it('should throw error for range out of bounds', () => {
      expect(() => PageRangeParser.parse('5-15', 10)).toThrow(/out of bounds/);
    });

    it('should throw error for inverted range', () => {
      expect(() => PageRangeParser.parse('5-2', 10)).toThrow(
        /Start page must be less than or equal to end page/
      );
    });

    it('should throw error for negative page', () => {
      expect(() => PageRangeParser.parse('-1', 10)).toThrow(/Invalid page range format/);
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
