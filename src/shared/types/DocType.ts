/**
 * Document type enumeration for file classification.
 *
 * Used by SplitterFactory to route files to the appropriate splitter.
 */
export enum DocType {
  PDF = 'pdf',
  IMAGE = 'image',
  WORD = 'word',
  POWERPOINT = 'powerpoint',
  EXCEL = 'excel',
}

/**
 * Extension to document type mapping.
 *
 * Only supports Office Open XML formats for Office documents.
 * Legacy formats (doc, xls, ppt) are not supported.
 */
export const EXTENSION_TO_DOCTYPE: Record<string, DocType> = {
  // PDF
  pdf: DocType.PDF,

  // Image
  jpg: DocType.IMAGE,
  jpeg: DocType.IMAGE,
  png: DocType.IMAGE,
  webp: DocType.IMAGE,

  // Word (Office Open XML only)
  docx: DocType.WORD,
  dotx: DocType.WORD,

  // PowerPoint (Office Open XML only)
  pptx: DocType.POWERPOINT,
  potx: DocType.POWERPOINT,

  // Excel (Office Open XML + CSV)
  xlsx: DocType.EXCEL,
  xltx: DocType.EXCEL,
  csv: DocType.EXCEL,
};

/**
 * Legacy formats that are not supported.
 *
 * These are OLE compound document formats that cannot be processed
 * by the libraries we use. Users should convert them to Office Open XML
 * formats first.
 */
export const LEGACY_FORMATS = ['doc', 'dot', 'ppt', 'pot', 'xls', 'xlt'];

/**
 * Check if a file extension is a legacy (unsupported) format.
 *
 * @param ext - File extension (with or without leading dot)
 * @returns True if the extension is a legacy format
 *
 * @example
 * isLegacyFormat('doc')   // true
 * isLegacyFormat('.doc')  // true
 * isLegacyFormat('docx')  // false
 */
export function isLegacyFormat(ext: string): boolean {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  return LEGACY_FORMATS.includes(normalized);
}
