/**
 * File Info
 */
export interface FileInfo {
  originalName: string;
  savedName: string;
  path: string;
  size: number;
  taskId: string;
}

/**
 * Image Path Info
 */
export interface ImagePathInfo {
  imagePath: string;
  exists: boolean;
}

/**
 * File Service Interface
 */
export interface IFileService {
  /**
   * Get upload directory path
   */
  getUploadDir(): string;

  /**
   * Get temp directory path
   */
  getTempDir(): string;

  /**
   * Upload file from path to task directory
   */
  uploadFile(taskId: string, filePath: string): Promise<FileInfo>;

  /**
   * Upload multiple files
   */
  uploadMultipleFiles(taskId: string, filePaths: string[]): Promise<FileInfo[]>;

  /**
   * Upload file content (for drag and drop)
   */
  uploadFileContent(taskId: string, fileName: string, content: ArrayBuffer): Promise<FileInfo>;

  /**
   * Get image path for a task page
   */
  getImagePath(taskId: string, page: number): ImagePathInfo;

  /**
   * Delete all files associated with a task
   */
  deleteTaskFiles(taskId: string): Promise<void>;

  /**
   * Download merged markdown file
   */
  downloadMarkdown(taskId: string, savePath: string): Promise<void>;
}
