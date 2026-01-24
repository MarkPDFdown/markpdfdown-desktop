/**
 * LLM Client Base Class and Factory
 * Infrastructure layer - contains implementation logic
 */

import type {
  ILLMClient,
  CompletionOptions,
  CompletionResponse,
  Message,
} from '../../../domain/llm/ILLMClient.js';

// Re-export types from domain for backward compatibility
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
} from '../../../domain/llm/ILLMClient.js';

/**
 * LLM Client abstract base class
 */
export abstract class LLMClient implements ILLMClient {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl: string = '') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Execute text completion
   */
  abstract completion(options: CompletionOptions): Promise<CompletionResponse>;

  /**
   * Normalize options for backward compatibility with single prompt
   * @param options Options that may contain old prompt format
   * @returns Normalized options
   */
  protected normalizeOptions(options: CompletionOptions & { prompt?: string }): CompletionOptions {
    const normalizedOptions = { ...options };

    // Convert old prompt field to message format
    if ('prompt' in normalizedOptions && normalizedOptions.prompt) {
      if (!normalizedOptions.messages || normalizedOptions.messages.length === 0) {
        normalizedOptions.messages = [{
          role: 'user',
          content: {
            type: 'text',
            text: normalizedOptions.prompt
          }
        }];
      }

      delete normalizedOptions.prompt;
    }

    // Add system message if systemPrompt is provided but no system message exists
    if (normalizedOptions.systemPrompt &&
        (!normalizedOptions.messages || !normalizedOptions.messages.some(m => m.role === 'system'))) {
      const systemMessage: Message = {
        role: 'system',
        content: {
          type: 'text',
          text: normalizedOptions.systemPrompt
        }
      };

      normalizedOptions.messages = normalizedOptions.messages || [];
      normalizedOptions.messages.unshift(systemMessage);

      delete normalizedOptions.systemPrompt;
    }

    return normalizedOptions;
  }
}

/**
 * LLM Client Factory
 * Creates appropriate client instances based on provider type
 */
export class LLMClientFactory {
  /**
   * Create LLM client instance
   * @param type LLM client type
   * @param apiKey API key
   * @param baseUrl Base URL (some services need custom URL)
   */
  static async createClient(type: string, apiKey: string, baseUrl?: string): Promise<LLMClient> {
    switch (type) {
      case 'openai': {
        const OpenAIModule = await import('./OpenAIClient.js');
        return new OpenAIModule.OpenAIClient(apiKey, baseUrl || '');
      }
      case 'openai-responses': {
        const OpenAIResponsesModule = await import('./OpenAIResponsesClient.js');
        return new OpenAIResponsesModule.OpenAIResponsesClient(apiKey, baseUrl || '');
      }
      case 'gemini': {
        const GeminiModule = await import('./GeminiClient.js');
        return new GeminiModule.GeminiClient(apiKey, baseUrl || '');
      }
      case 'anthropic': {
        const AnthropicModule = await import('./AnthropicClient.js');
        return new AnthropicModule.AnthropicClient(apiKey, baseUrl || '');
      }
      case 'ollama': {
        const OllamaModule = await import('./OllamaClient.js');
        return new OllamaModule.OllamaClient(apiKey, baseUrl || '');
      }
      default:
        throw new Error(`Unsupported LLM client type: ${type}`);
    }
  }
}
