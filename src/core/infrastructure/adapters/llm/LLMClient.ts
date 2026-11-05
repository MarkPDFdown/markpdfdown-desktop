/**
 * LLM Client Base Class and Factory
 * Infrastructure layer - contains implementation logic
 */

import { FINISH_REASON_TRUNCATED } from '../../../domain/llm/ILLMClient.js';
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
 * Lowercased provider values meaning the output hit the token limit.
 * Shared rather than per client: OpenAI- and Anthropic-compatible gateways don't always
 * use the value of the protocol they implement.
 */
const TRUNCATION_FINISH_REASONS = new Set(['length', 'max_tokens', 'max_output_tokens']);

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
   * Map the provider's truncation reasons to FINISH_REASON_TRUNCATED, leaving others as they are.
   * Clients only report the reason: whether truncation is an error is up to the caller,
   * as the connection test deliberately runs with a tiny maxTokens.
   */
  protected normalizeFinishReason(reason?: string | null): string | undefined {
    if (!reason) {
      return undefined;
    }
    return TRUNCATION_FINISH_REASONS.has(reason.toLowerCase()) ? FINISH_REASON_TRUNCATED : reason;
  }

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
   * @param options.exactEndpoint baseUrl is the complete endpoint, the client must not extend it.
   *   Only Gemini extends its URL (with the model path); the other clients always post to baseUrl.
   */
  static async createClient(
    type: string,
    apiKey: string,
    baseUrl?: string,
    options: { exactEndpoint?: boolean } = {}
  ): Promise<LLMClient> {
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
        return new GeminiModule.GeminiClient(apiKey, baseUrl || '', options.exactEndpoint);
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
