export { WorkerOrchestrator, workerOrchestrator } from './WorkerOrchestrator.js';
export { default as modelService } from './ModelService.js';

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
} from './interfaces/index.js';
