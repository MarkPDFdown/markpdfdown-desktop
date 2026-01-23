import { Task } from '../../types/index.js';

/**
 * Information about a single page after splitting
 */
export interface PageInfo {
  /** Page number (1-based, sequential) */
  page: number;
  /** Original source page number (for PDF page ranges) */
  pageSource: number;
  /** Full path to the generated image file */
  imagePath: string;
}

/**
 * Result of a splitting operation
 */
export interface SplitResult {
  /** Array of page information */
  pages: PageInfo[];
  /** Total number of pages generated */
  totalPages: number;
}

/**
 * Interface for file splitters
 * Implements the Strategy pattern for handling different file types
 */
export interface ISplitter {
  /**
   * Split a file into individual page images
   * @param task - Task containing file information
   * @returns Split result with page information
   * @throws Error if splitting fails
   */
  split(task: Task): Promise<SplitResult>;

  /**
   * Clean up temporary files for a task
   * @param taskId - Task ID to clean up
   */
  cleanup(taskId: string): Promise<void>;
}
