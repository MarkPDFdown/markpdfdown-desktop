// Backward-compatible re-export from new location
export { WorkerOrchestrator, workerOrchestrator } from '../application/services/index.js';

// Re-export interfaces
export type {
  IWorkerOrchestrator,
  WorkerInfo,
  WorkerStatus,
  CleanupResult,
  ITaskService,
  TaskInput,
  IFileService,
  FileInfo,
  ImagePathInfo,
} from '../application/services/interfaces/index.js';
