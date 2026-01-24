// Shared Layer
// Contains shared utilities: events, DI container

// Events
export {
  eventBus,
  TaskEventType,
  type TaskEventData,
  type TaskDetailEventData,
} from './events/EventBus.js';

// Dependency Injection
export {
  createContainer,
  getContainer,
  setContainer,
  resetContainer,
  type AppConfig,
  type DIContainer,
} from './di/index.js';
