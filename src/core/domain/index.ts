// Domain Layer
// Contains core business logic: repositories, split logic

// Repositories
export {
  default as providerRepository,
} from './repositories/ProviderRepository.js';
export {
  default as modelRepository,
} from './repositories/ModelRepository.js';
export {
  default as taskRepository,
} from './repositories/TaskRepository.js';
export {
  default as taskDetailRepository,
} from './repositories/TaskDetailRepository.js';

// Repository Interfaces
export type {
  IProviderRepository,
  IModelRepository,
  ITaskRepository,
  ITaskDetailRepository,
} from './repositories/interfaces/index.js';

// Split Logic
export {
  ISplitter,
  PDFSplitter,
  ImageSplitter,
  SplitterFactory,
  PageRangeParser,
  ImagePathUtil,
  type SplitResult,
  type PageInfo,
  type PageRange,
} from './split/index.js';
