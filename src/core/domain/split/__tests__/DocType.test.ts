import { describe, it, expect } from 'vitest';
import {
  DocType,
  EXTENSION_TO_DOCTYPE,
  LEGACY_FORMATS,
  isLegacyFormat,
} from '../../../../shared/types/DocType.js';

describe('DocType', () => {
  describe('DocType enum', () => {
    it('should have correct values', () => {
      expect(DocType.PDF).toBe('pdf');
      expect(DocType.IMAGE).toBe('image');
      expect(DocType.WORD).toBe('word');
      expect(DocType.POWERPOINT).toBe('powerpoint');
      expect(DocType.EXCEL).toBe('excel');
    });
  });

  describe('EXTENSION_TO_DOCTYPE', () => {
    it('should map PDF extension', () => {
      expect(EXTENSION_TO_DOCTYPE['pdf']).toBe(DocType.PDF);
    });

    it('should map image extensions', () => {
      expect(EXTENSION_TO_DOCTYPE['jpg']).toBe(DocType.IMAGE);
      expect(EXTENSION_TO_DOCTYPE['jpeg']).toBe(DocType.IMAGE);
      expect(EXTENSION_TO_DOCTYPE['png']).toBe(DocType.IMAGE);
      expect(EXTENSION_TO_DOCTYPE['webp']).toBe(DocType.IMAGE);
    });

    it('should map Word extensions', () => {
      expect(EXTENSION_TO_DOCTYPE['docx']).toBe(DocType.WORD);
      expect(EXTENSION_TO_DOCTYPE['dotx']).toBe(DocType.WORD);
    });

    it('should map PowerPoint extensions', () => {
      expect(EXTENSION_TO_DOCTYPE['pptx']).toBe(DocType.POWERPOINT);
      expect(EXTENSION_TO_DOCTYPE['potx']).toBe(DocType.POWERPOINT);
    });

    it('should map Excel extensions', () => {
      expect(EXTENSION_TO_DOCTYPE['xlsx']).toBe(DocType.EXCEL);
      expect(EXTENSION_TO_DOCTYPE['xltx']).toBe(DocType.EXCEL);
      expect(EXTENSION_TO_DOCTYPE['csv']).toBe(DocType.EXCEL);
    });

    it('should return undefined for unsupported extensions', () => {
      expect(EXTENSION_TO_DOCTYPE['txt']).toBeUndefined();
      expect(EXTENSION_TO_DOCTYPE['doc']).toBeUndefined();
      expect(EXTENSION_TO_DOCTYPE['xls']).toBeUndefined();
    });
  });

  describe('LEGACY_FORMATS', () => {
    it('should contain legacy Office formats', () => {
      expect(LEGACY_FORMATS).toContain('doc');
      expect(LEGACY_FORMATS).toContain('dot');
      expect(LEGACY_FORMATS).toContain('ppt');
      expect(LEGACY_FORMATS).toContain('pot');
      expect(LEGACY_FORMATS).toContain('xls');
      expect(LEGACY_FORMATS).toContain('xlt');
    });

    it('should not contain modern Office formats', () => {
      expect(LEGACY_FORMATS).not.toContain('docx');
      expect(LEGACY_FORMATS).not.toContain('pptx');
      expect(LEGACY_FORMATS).not.toContain('xlsx');
    });
  });

  describe('isLegacyFormat()', () => {
    it('should return true for legacy formats', () => {
      expect(isLegacyFormat('doc')).toBe(true);
      expect(isLegacyFormat('dot')).toBe(true);
      expect(isLegacyFormat('ppt')).toBe(true);
      expect(isLegacyFormat('pot')).toBe(true);
      expect(isLegacyFormat('xls')).toBe(true);
      expect(isLegacyFormat('xlt')).toBe(true);
    });

    it('should return false for modern formats', () => {
      expect(isLegacyFormat('docx')).toBe(false);
      expect(isLegacyFormat('pptx')).toBe(false);
      expect(isLegacyFormat('xlsx')).toBe(false);
      expect(isLegacyFormat('pdf')).toBe(false);
    });

    it('should handle leading dots', () => {
      expect(isLegacyFormat('.doc')).toBe(true);
      expect(isLegacyFormat('.xls')).toBe(true);
      expect(isLegacyFormat('.docx')).toBe(false);
    });

    it('should handle uppercase extensions', () => {
      expect(isLegacyFormat('DOC')).toBe(true);
      expect(isLegacyFormat('XLS')).toBe(true);
      expect(isLegacyFormat('DOCX')).toBe(false);
    });

    it('should handle mixed case extensions', () => {
      expect(isLegacyFormat('Doc')).toBe(true);
      expect(isLegacyFormat('Xls')).toBe(true);
    });
  });
});
