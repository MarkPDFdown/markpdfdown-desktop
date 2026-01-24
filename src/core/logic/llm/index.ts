// Backward-compatible re-export from new location
export {
  LLMClient,
  LLMClientFactory,
  type CompletionOptions,
  type CompletionResponse,
  OpenAIClient,
  OpenAIResponsesClient,
  GeminiClient,
  AnthropicClient,
  OllamaClient,
  default,
} from '../../infrastructure/adapters/llm/index.js';
