/**
 * Worker Information
 */
export interface WorkerInfo {
  id: string;
  running: boolean;
}

/**
 * Worker Status
 */
export interface WorkerStatus {
  isRunning: boolean;
  splitterWorker: WorkerInfo | null;
  converterWorkers: WorkerInfo[];
  mergerWorker: WorkerInfo | null;
  directories: {
    uploads: string;
  };
}

/**
 * Cleanup Result
 */
export interface CleanupResult {
  orphanedPages: number;
  orphanedSplittingTasks: number;
  orphanedMergingTasks: number;
  total: number;
}

/**
 * Worker Orchestrator Interface
 *
 * Manages all worker lifecycle:
 * - SplitterWorker: Splits PDF/images into pages
 * - ConverterWorker: Converts pages to Markdown
 * - MergerWorker: Merges pages into final document
 */
export interface IWorkerOrchestrator {
  /**
   * Start all workers
   */
  start(): Promise<void>;

  /**
   * Stop all workers gracefully
   */
  stop(): Promise<void>;

  /**
   * Get running status
   */
  getStatus(): boolean;

  /**
   * Get detailed worker information
   */
  getWorkerInfo(): WorkerStatus;

  /**
   * Clean up orphaned work from previous abnormal shutdown
   */
  cleanupOrphanedWork(): Promise<CleanupResult>;
}
