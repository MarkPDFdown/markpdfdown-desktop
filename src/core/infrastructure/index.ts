// Infrastructure Layer
// Contains implementations for external dependencies: database, config, adapters

// Database
export { prisma } from './db/index.js';
export { migrateDatabase, runCustomMigrations } from './db/Migration.js';

// Configuration
export { WORKER_CONFIG } from './config/worker.config.js';

// Services
export { default as fileService } from './services/FileService.js';

// LLM Adapters
export {
  LLMClient,
  LLMClientFactory,
  OpenAIClient,
  AnthropicClient,
  GeminiClient,
  OllamaClient,
  OpenAIResponsesClient,
  type Message,
  type MessageContent,
  type TextContent,
  type ImageContent,
  type CompletionOptions,
  type CompletionResponse,
} from './adapters/llm/index.js';
