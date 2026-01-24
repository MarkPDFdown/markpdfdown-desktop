import { SplitterWorker, ConverterWorker, MergerWorker } from '../workers/index.js';
import { ImagePathUtil } from '../logic/split/index.js';
import fileLogic from '../logic/File.js';
import { WORKER_CONFIG } from '../config/worker.config.js';
import { prisma } from '../db/index.js';
import { TaskStatus } from '../../shared/types/TaskStatus.js';
import { PageStatus } from '../../shared/types/PageStatus.js';
import type { IWorkerOrchestrator, WorkerStatus, CleanupResult } from './interfaces/IWorkerOrchestrator.js';

/**
 * WorkerOrchestrator - Central worker lifecycle manager
 *
 * Manages all worker lifecycle:
 * - SplitterWorker: Splits PDF/images into pages
 * - ConverterWorker: Converts pages to Markdown
 * - MergerWorker: Merges pages into final document
 */
export class WorkerOrchestrator implements IWorkerOrchestrator {
  private isRunning: boolean;
  private splitterWorker: SplitterWorker | null;
  private converterWorkers: ConverterWorker[];
  private mergerWorker: MergerWorker | null;
  private uploadsDir: string;

  constructor() {
    this.isRunning = false;
    this.splitterWorker = null;
    this.converterWorkers = [];
    this.mergerWorker = null;

    // Use FileLogic for consistent directory paths across dev/prod
    this.uploadsDir = fileLogic.getUploadDir();
  }

  /**
   * Start all workers
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[WorkerOrchestrator] Workers already running');
      return;
    }

    try {
      console.log('[WorkerOrchestrator] Initializing workers...');

      // Clean up orphaned tasks/pages from previous abnormal shutdown
      await this.cleanupOrphanedWork();

      // Initialize ImagePathUtil (critical for image path calculation)
      // Split results are stored in: {uploadsDir}/{taskId}/split/
      ImagePathUtil.init(this.uploadsDir);
      console.log(`[WorkerOrchestrator] ImagePathUtil initialized with uploadsDir: ${this.uploadsDir}`);

      // Start SplitterWorker
      this.splitterWorker = new SplitterWorker(this.uploadsDir);
      console.log(`[WorkerOrchestrator] SplitterWorker created (ID: ${this.splitterWorker.getWorkerId()})`);

      // Run worker in background (non-blocking)
      this.splitterWorker.run().catch((error) => {
        console.error('[WorkerOrchestrator] SplitterWorker error:', error);
      });

      // Start ConverterWorkers
      const converterCount = WORKER_CONFIG.converter.count;
      for (let i = 0; i < converterCount; i++) {
        const worker = new ConverterWorker();
        this.converterWorkers.push(worker);
        console.log(`[WorkerOrchestrator] ConverterWorker ${i + 1}/${converterCount} created (ID: ${worker.getWorkerId().slice(0, 8)})`);

        // Run each converter worker in background
        worker.run().catch((error) => {
          console.error(`[WorkerOrchestrator] ConverterWorker ${worker.getWorkerId().slice(0, 8)} error:`, error);
        });
      }

      // Start MergerWorker
      this.mergerWorker = new MergerWorker(this.uploadsDir);
      console.log(`[WorkerOrchestrator] MergerWorker created (ID: ${this.mergerWorker.getWorkerId().slice(0, 8)})`);

      this.mergerWorker.run().catch((error) => {
        console.error('[WorkerOrchestrator] MergerWorker error:', error);
      });

      this.isRunning = true;
      console.log('[WorkerOrchestrator] All workers started successfully');
    } catch (error) {
      console.error('[WorkerOrchestrator] Failed to start workers:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop all workers gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('[WorkerOrchestrator] Workers not running');
      return;
    }

    try {
      console.log('[WorkerOrchestrator] Stopping workers...');

      // Stop SplitterWorker
      if (this.splitterWorker) {
        this.splitterWorker.stop();
        console.log('[WorkerOrchestrator] SplitterWorker stopped');
        this.splitterWorker = null;
      }

      // Stop all ConverterWorkers
      for (const worker of this.converterWorkers) {
        worker.stop();
        console.log(`[WorkerOrchestrator] ConverterWorker ${worker.getWorkerId().slice(0, 8)} stopped`);
      }
      this.converterWorkers = [];

      // Stop MergerWorker
      if (this.mergerWorker) {
        this.mergerWorker.stop();
        console.log(`[WorkerOrchestrator] MergerWorker ${this.mergerWorker.getWorkerId().slice(0, 8)} stopped`);
        this.mergerWorker = null;
      }

      this.isRunning = false;
      console.log('[WorkerOrchestrator] All workers stopped');
    } catch (error) {
      console.error('[WorkerOrchestrator] Error stopping workers:', error);
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
  getWorkerInfo(): WorkerStatus {
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
      mergerWorker: this.mergerWorker ? {
        id: this.mergerWorker.getWorkerId().slice(0, 8),
        running: this.mergerWorker.getIsRunning(),
      } : null,
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
  async cleanupOrphanedWork(): Promise<CleanupResult> {
    try {
      console.log('[WorkerOrchestrator] Checking for orphaned work from previous session...');

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
        console.log(`[WorkerOrchestrator] Reset ${orphanedPages.count} orphaned pages to PENDING`);
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
        console.log(`[WorkerOrchestrator] Reset ${orphanedSplittingTasks.count} orphaned SPLITTING tasks to PENDING`);
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
        console.log(`[WorkerOrchestrator] Reset ${orphanedMergingTasks.count} orphaned MERGING tasks to READY_TO_MERGE`);
      }

      const result: CleanupResult = {
        orphanedPages: orphanedPages.count,
        orphanedSplittingTasks: orphanedSplittingTasks.count,
        orphanedMergingTasks: orphanedMergingTasks.count,
        total: orphanedPages.count + orphanedSplittingTasks.count + orphanedMergingTasks.count,
      };

      if (result.total === 0) {
        console.log('[WorkerOrchestrator] No orphaned work found');
      } else {
        console.log(`[WorkerOrchestrator] Cleanup complete: ${result.total} items recovered`);
      }

      return result;
    } catch (error) {
      console.error('[WorkerOrchestrator] Failed to clean up orphaned work:', error);
      // Return empty result - allow workers to start even if cleanup fails
      return {
        orphanedPages: 0,
        orphanedSplittingTasks: 0,
        orphanedMergingTasks: 0,
        total: 0,
      };
    }
  }
}

// Create singleton instance for backward compatibility
export const workerOrchestrator = new WorkerOrchestrator();

// Default export for backward compatibility with Task.ts
export default workerOrchestrator;
