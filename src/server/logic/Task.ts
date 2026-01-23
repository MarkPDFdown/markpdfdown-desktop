import { SplitterWorker } from '../workers/index.js';
import { ImagePathUtil } from './split/index.js';
import fileLogic from './File.js';

/**
 * TaskLogic - Central task orchestrator
 *
 * Manages all worker lifecycle:
 * - SplitterWorker: Splits PDF/images into pages
 * - ConverterWorker: Converts pages to Markdown (future)
 * - MergerWorker: Merges pages into final document (future)
 */
class TaskLogic {
  private isRunning: boolean;
  private splitterWorker: SplitterWorker | null;
  private uploadsDir: string;

  constructor() {
    this.isRunning = false;
    this.splitterWorker = null;

    // Use FileLogic for consistent directory paths across dev/prod
    this.uploadsDir = fileLogic.getUploadDir();
  }

  /**
   * Start all workers
   */
  async start() {
    if (this.isRunning) {
      console.warn('[TaskLogic] Workers already running');
      return;
    }

    try {
      console.log('[TaskLogic] Initializing workers...');

      // Initialize ImagePathUtil (critical for image path calculation)
      // Split results are stored in: {uploadsDir}/{taskId}/split/
      ImagePathUtil.init(this.uploadsDir);
      console.log(`[TaskLogic] ImagePathUtil initialized with uploadsDir: ${this.uploadsDir}`);

      // Start SplitterWorker
      this.splitterWorker = new SplitterWorker(this.uploadsDir);
      console.log(`[TaskLogic] SplitterWorker created (ID: ${this.splitterWorker.getWorkerId()})`);

      // Run worker in background (non-blocking)
      this.splitterWorker.run().catch((error) => {
        console.error('[TaskLogic] SplitterWorker error:', error);
      });

      this.isRunning = true;
      console.log('[TaskLogic] All workers started successfully');
    } catch (error) {
      console.error('[TaskLogic] Failed to start workers:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop all workers gracefully
   */
  async stop() {
    if (!this.isRunning) {
      console.warn('[TaskLogic] Workers not running');
      return;
    }

    try {
      console.log('[TaskLogic] Stopping workers...');

      // Stop SplitterWorker
      if (this.splitterWorker) {
        this.splitterWorker.stop();
        console.log('[TaskLogic] SplitterWorker stopped');
        this.splitterWorker = null;
      }

      this.isRunning = false;
      console.log('[TaskLogic] All workers stopped');
    } catch (error) {
      console.error('[TaskLogic] Error stopping workers:', error);
      throw error;
    }
  }

  /**
   * Get running status
   */
  getStatus(): boolean {
    return this.isRunning;
  }

  /**
   * Get worker information (for debugging/monitoring)
   */
  getWorkerInfo() {
    return {
      isRunning: this.isRunning,
      splitterWorker: this.splitterWorker ? {
        id: this.splitterWorker.getWorkerId(),
        running: this.splitterWorker.getIsRunning(),
      } : null,
      directories: {
        uploads: this.uploadsDir,
      },
    };
  }
}

export default new TaskLogic();
