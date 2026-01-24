/**
 * LLM Client Interface and Type Definitions
 * Domain layer - no external dependencies
 */

/**
 * Message content type
 */
export type ContentType = 'text' | 'image_url' | 'tool_call' | 'tool_result';

/**
 * Message role
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Text content
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content
 */
export interface ImageContent {
  type: 'image_url';
  image_url: { url: string }; // Can be URL or base64 encoded data URI
}

/**
 * Tool call content
 */
export interface ToolCallContent {
  type: 'tool_call';
  tool_call_id: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Tool result content
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_call_id: string;
  content: string;
}

/**
 * Message content union type
 */
export type MessageContent = TextContent | ImageContent | ToolCallContent | ToolResultContent;

/**
 * Chat message
 */
export interface Message {
  role: MessageRole;
  content: MessageContent | MessageContent[];
  name?: string; // Used to differentiate users or tools
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema object
  };
}

/**
 * Completion options
 */
export interface CompletionOptions {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  apiKey?: string;
  stream?: boolean;
  onUpdate?: (content: string) => void;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'text' | 'json_object' };
  systemPrompt?: string; // For backward compatibility
}

/**
 * Tool call response
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Completion response
 */
export interface CompletionResponse {
  content: string;
  model: string;
  finishReason?: string;
  toolCalls?: ToolCall[];
  responseFormat?: 'text' | 'json_object';
  rawResponse?: any; // Raw response for debugging
}

/**
 * LLM Client interface
 * Strategy pattern for different LLM providers
 */
export interface ILLMClient {
  /**
   * Execute text completion
   */
  completion(options: CompletionOptions): Promise<CompletionResponse>;
}
