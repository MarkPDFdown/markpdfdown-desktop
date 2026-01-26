/**
 * Static parser for page range strings.
 *
 * Supports multiple formats:
 * - "" or null: All pages
 * - "1": Single page
 * - "1-5": Range (inclusive)
 * - "1,3,5": Multiple pages
 * - "1-5,7,11-14": Mixed format
 *
 * Returns sorted, deduplicated 1-based page numbers.
 */
export class PageRangeParser {
  /**
   * Regular expression for validating page range format.
   * Matches patterns like "1", "1-5", "1,3,5", "1-5,7,11-14"
   */
  private static readonly RANGE_REGEX = /^(\d+(-\d+)?(,\d+(-\d+)?)*)$/;

  /**
   * Parse a page range string into an array of page numbers.
   *
   * @param rangeStr - Page range string (e.g., "1-5,7,11-14") or null/empty for all pages
   * @param totalPages - Total number of pages in the document
   * @returns Sorted, deduplicated array of 1-based page numbers
   * @throws Error if format is invalid or pages are out of bounds
   *
   * @example
   * parse("1-3,5", 10) // [1, 2, 3, 5]
   * parse("", 5) // [1, 2, 3, 4, 5]
   * parse(null, 5) // [1, 2, 3, 4, 5]
   * parse("3,1,2,2", 10) // [1, 2, 3] (sorted and deduplicated)
   */
  static parse(rangeStr: string | null | undefined, totalPages: number): number[] {
    // Handle empty/null case: return all pages
    if (!rangeStr || rangeStr.trim() === '') {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Remove all whitespace for processing
    const normalized = rangeStr.trim().replace(/\s+/g, '');

    // Validate format
    if (!this.validate(normalized)) {
      throw new Error(`Invalid page range format: "${rangeStr}". Use formats like "1", "1-5", "1,3,5", or "1-5,7,11-14"`);
    }

    const pages = new Set<number>();

    // Split by comma
    const parts = normalized.split(',');

    for (const part of parts) {
      if (part.includes('-')) {
        // Handle range (e.g., "1-5")
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (start > end) {
          throw new Error(`Invalid range: ${part}. Start page must be less than or equal to end page.`);
        }

        // Clamp range to valid bounds instead of throwing error
        const clampedStart = Math.max(1, Math.min(start, totalPages));
        const clampedEnd = Math.max(1, Math.min(end, totalPages));

        // Log warning if clamping occurred
        if (start < 1 || end > totalPages || start > totalPages) {
          console.warn(
            `[PageRangeParser] Requested page range ${part} adjusted to fit document bounds (1-${totalPages})`
          );
        }

        // Skip if start is beyond total pages
        if (start > totalPages) {
          continue;
        }

        // Add all pages in clamped range
        for (let i = clampedStart; i <= clampedEnd; i++) {
          pages.add(i);
        }
      } else {
        // Handle single page (e.g., "3")
        const page = parseInt(part, 10);

        // Skip pages that are out of bounds with a warning
        if (page < 1 || page > totalPages) {
          console.warn(
            `[PageRangeParser] Page ${page} is out of bounds (valid: 1-${totalPages}), skipping`
          );
          continue;
        }

        pages.add(page);
      }
    }

    // Convert to sorted array
    const result = Array.from(pages).sort((a, b) => a - b);

    // Ensure at least one valid page exists
    if (result.length === 0) {
      throw new Error(
        `No valid pages found in range "${rangeStr}". Document has ${totalPages} page(s), valid range: 1-${totalPages}`
      );
    }

    return result;
  }

  /**
   * Validate a page range string format (without checking bounds).
   *
   * @param rangeStr - Page range string to validate
   * @returns True if format is valid, false otherwise
   *
   * @example
   * validate("1-5") // true
   * validate("1,3,5") // true
   * validate("abc") // false
   * validate("1-") // false
   */
  static validate(rangeStr: string | null | undefined): boolean {
    if (!rangeStr || rangeStr.trim() === '') {
      return true; // Empty is valid (means all pages)
    }

    return this.RANGE_REGEX.test(rangeStr.trim());
  }

  /**
   * Parse an Excel sheet range.
   *
   * Uses the same format as page numbers:
   * - Single: "1"
   * - Range: "1-3"
   * - Mixed: "1,3,5-7"
   *
   * @param range - Range string
   * @param sheetCount - Total number of sheets
   * @returns Object with indices array and raw string
   */
  static parseSheetRange(
    range: string | undefined,
    sheetCount: number
  ): { indices: number[]; raw: string } {
    if (!range || range.trim() === '') {
      return {
        indices: Array.from({ length: sheetCount }, (_, i) => i + 1),
        raw: '',
      };
    }

    const indices = this.parse(range, sheetCount);
    return {
      indices,
      raw: range,
    };
  }

  /**
   * Filter sheet names by range.
   *
   * @param sheetNames - Array of sheet names
   * @param range - Parsed sheet range
   * @returns Filtered array of sheet names
   */
  static filterSheets(
    sheetNames: string[],
    range: { indices: number[]; raw: string }
  ): string[] {
    return range.indices.map((i) => sheetNames[i - 1]);
  }
}
