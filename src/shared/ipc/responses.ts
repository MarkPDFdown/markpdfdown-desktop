/**
 * IPC Response Types
 *
 * Standard response types for IPC communication between main and renderer processes.
 */

/**
 * Standard IPC response wrapper
 */
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  list: T[];
  total: number;
}

/**
 * File info response
 */
export interface FileInfo {
  originalName: string;
  savedName: string;
  path: string;
  size: number;
  taskId: string;
}

/**
 * Upload result response
 */
export interface UploadResult {
  message: string;
  files: FileInfo[];
}

/**
 * Cost statistics response
 */
export interface CostStats {
  total: {
    pages: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    total_conversion_time: number;
    avg_conversion_time: number;
  };
  byStatus: Record<string, {
    count: number;
    input_tokens: number;
    output_tokens: number;
  }>;
}

/**
 * Running tasks check response
 */
export interface RunningTasksResponse {
  hasRunning: boolean;
  count: number;
}

/**
 * File selection dialog response
 */
export interface FileSelectResponse {
  filePaths: string[];
  canceled: boolean;
}

/**
 * Download result response
 */
export interface DownloadResponse {
  savedPath: string;
}

/**
 * Image path response
 */
export interface ImagePathResponse {
  imagePath: string;
  exists: boolean;
}

/**
 * Helper type for creating typed IPC responses
 */
export type TypedIpcResponse<T> = Promise<IpcResponse<T>>;
