// Domain Layer
// Contains core business logic: repositories, interfaces, pure logic

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

// Split - interfaces and pure logic only
export { PageRangeParser } from './split/index.js';

export type {
  ISplitter,
  SplitResult,
  PageInfo,
} from './split/index.js';

// LLM - interfaces and types only
export type {
  ContentType,
  MessageRole,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent,
  MessageContent,
  Message,
  ToolDefinition,
  CompletionOptions,
  ToolCall,
  CompletionResponse,
  ILLMClient,
} from './llm/index.js';
