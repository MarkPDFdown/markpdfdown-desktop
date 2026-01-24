import { prisma } from '../../db/index.js';
import { eventBus } from '../events/EventBus.js';
import { WorkerOrchestrator } from '../../services/WorkerOrchestrator.js';

// Import repositories
import providerRepository from '../../repositories/ProviderRepository.js';
import modelRepository from '../../repositories/ModelRepository.js';
import taskRepository from '../../repositories/TaskRepository.js';
import taskDetailRepository from '../../repositories/TaskDetailRepository.js';

// Import logic/services
import fileLogic from '../../logic/File.js';
import modelLogic from '../../logic/Model.js';

/**
 * Application Configuration
 */
export interface AppConfig {
  uploadsDir?: string;
  converterWorkerCount?: number;
}

/**
 * DI Container Interface
 *
 * Contains all application dependencies for easy testing and configuration.
 */
export interface DIContainer {
  // Database
  prisma: typeof prisma;

  // Event System
  eventBus: typeof eventBus;

  // Repositories
  providerRepository: typeof providerRepository;
  modelRepository: typeof modelRepository;
  taskRepository: typeof taskRepository;
  taskDetailRepository: typeof taskDetailRepository;

  // Services
  fileService: typeof fileLogic;
  modelService: typeof modelLogic;
  workerOrchestrator: WorkerOrchestrator;
}

/**
 * Create and configure the DI container
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createContainer(_config?: AppConfig): DIContainer {
  // Create worker orchestrator
  const workerOrchestrator = new WorkerOrchestrator();

  return {
    // Database
    prisma,

    // Event System
    eventBus,

    // Repositories
    providerRepository,
    modelRepository,
    taskRepository,
    taskDetailRepository,

    // Services
    fileService: fileLogic,
    modelService: modelLogic,
    workerOrchestrator,
  };
}

// Create default container instance
let containerInstance: DIContainer | null = null;

/**
 * Get the singleton container instance
 */
export function getContainer(): DIContainer {
  if (!containerInstance) {
    containerInstance = createContainer();
  }
  return containerInstance;
}

/**
 * Set a custom container (for testing)
 */
export function setContainer(container: DIContainer): void {
  containerInstance = container;
}

/**
 * Reset container to default (for testing)
 */
export function resetContainer(): void {
  containerInstance = null;
}

export default {
  createContainer,
  getContainer,
  setContainer,
  resetContainer,
};
