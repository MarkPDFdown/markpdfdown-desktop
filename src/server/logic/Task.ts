import { app } from 'electron';
import isDev from 'electron-is-dev';
import path from 'path';
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
  private tempDir: string;

  constructor() {
    this.isRunning = false;
    this.splitterWorker = null;

    // Use FileLogic for consistent directory paths across dev/prod
    this.uploadsDir = fileLogic.getUploadDir();

    // Temp directory: same logic as File.ts
    if (isDev) {
      this.tempDir = path.join(process.cwd(), 'temp');
    } else {
      const userDataPath = app.getPath('userData');
      this.tempDir = path.join(userDataPath, 'temp');
    }
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
      ImagePathUtil.init(this.tempDir);
      console.log(`[TaskLogic] ImagePathUtil initialized with tempDir: ${this.tempDir}`);

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
        temp: this.tempDir,
      },
    };
  }
}

export default new TaskLogic();
