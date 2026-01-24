import { SplitterWorker, ConverterWorker } from '../workers/index.js';
import { ImagePathUtil } from './split/index.js';
import fileLogic from './File.js';
import { WORKER_CONFIG } from '../config/worker.config.js';
import { prisma } from '../db/index.js';
import { TaskStatus } from '../types/TaskStatus.js';
import { PageStatus } from '../types/PageStatus.js';

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
  private converterWorkers: ConverterWorker[];
  private uploadsDir: string;

  constructor() {
    this.isRunning = false;
    this.splitterWorker = null;
    this.converterWorkers = [];

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

      // Clean up orphaned tasks/pages from previous abnormal shutdown
      await this.cleanupOrphanedWork();

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

      // Start ConverterWorkers
      const converterCount = WORKER_CONFIG.converter.count;
      for (let i = 0; i < converterCount; i++) {
        const worker = new ConverterWorker();
        this.converterWorkers.push(worker);
        console.log(`[TaskLogic] ConverterWorker ${i + 1}/${converterCount} created (ID: ${worker.getWorkerId().slice(0, 8)})`);

        // Run each converter worker in background
        worker.run().catch((error) => {
          console.error(`[TaskLogic] ConverterWorker ${worker.getWorkerId().slice(0, 8)} error:`, error);
        });
      }

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

      // Stop all ConverterWorkers
      for (const worker of this.converterWorkers) {
        worker.stop();
        console.log(`[TaskLogic] ConverterWorker ${worker.getWorkerId().slice(0, 8)} stopped`);
      }
      this.converterWorkers = [];

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
      converterWorkers: this.converterWorkers.map((worker) => ({
        id: worker.getWorkerId().slice(0, 8),
        running: worker.getIsRunning(),
      })),
      directories: {
        uploads: this.uploadsDir,
      },
    };
  }

  /**
   * Clean up orphaned tasks and pages from previous abnormal shutdown.
   *
   * This handles the case where the application was closed while tasks were in progress:
   * - Pages with status=PROCESSING and worker_id set (orphaned by crashed workers)
   * - Tasks with status=SPLITTING (orphaned splitter work)
   *
   * These are reset to their previous state so new workers can pick them up.
   */
  private async cleanupOrphanedWork(): Promise<void> {
    try {
      console.log('[TaskLogic] Checking for orphaned work from previous session...');

      // Reset orphaned pages (PROCESSING -> PENDING)
      // These are pages that were being processed when the app was closed
      const orphanedPages = await prisma.taskDetail.updateMany({
        where: {
          status: PageStatus.PROCESSING,
          worker_id: { not: null },
        },
        data: {
          status: PageStatus.PENDING,
          worker_id: null,
          started_at: null,
        },
      });

      if (orphanedPages.count > 0) {
        console.log(`[TaskLogic] Reset ${orphanedPages.count} orphaned pages to PENDING`);
      }

      // Reset orphaned splitting tasks (SPLITTING -> PENDING)
      // These are tasks that were being split when the app was closed
      const orphanedSplittingTasks = await prisma.task.updateMany({
        where: {
          status: TaskStatus.SPLITTING,
          worker_id: { not: null },
        },
        data: {
          status: TaskStatus.PENDING,
          worker_id: null,
        },
      });

      if (orphanedSplittingTasks.count > 0) {
        console.log(`[TaskLogic] Reset ${orphanedSplittingTasks.count} orphaned SPLITTING tasks to PENDING`);
      }

      // Reset orphaned merging tasks (MERGING -> READY_TO_MERGE)
      // These are tasks that were being merged when the app was closed
      const orphanedMergingTasks = await prisma.task.updateMany({
        where: {
          status: TaskStatus.MERGING,
          worker_id: { not: null },
        },
        data: {
          status: TaskStatus.READY_TO_MERGE,
          worker_id: null,
        },
      });

      if (orphanedMergingTasks.count > 0) {
        console.log(`[TaskLogic] Reset ${orphanedMergingTasks.count} orphaned MERGING tasks to READY_TO_MERGE`);
      }

      const totalOrphaned = orphanedPages.count + orphanedSplittingTasks.count + orphanedMergingTasks.count;
      if (totalOrphaned === 0) {
        console.log('[TaskLogic] No orphaned work found');
      } else {
        console.log(`[TaskLogic] Cleanup complete: ${totalOrphaned} items recovered`);
      }
    } catch (error) {
      console.error('[TaskLogic] Failed to clean up orphaned work:', error);
      // Don't throw - allow workers to start even if cleanup fails
    }
  }
}

export default new TaskLogic();
