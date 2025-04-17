/**
 * LLM客户端接口定义
 */

/**
 * 消息内容类型
 */
export type ContentType = 'text' | 'image' | 'tool_call' | 'tool_result';

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 文本内容
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * 图片内容
 */
export interface ImageContent {
  type: 'image';
  image_url: string; // 可以是URL或base64编码的数据URI
  detail?: 'low' | 'high' | 'auto'; // 图片处理细节级别
}

/**
 * 工具调用内容
 */
export interface ToolCallContent {
  type: 'tool_call';
  tool_call_id: string;
  function: {
    name: string;
    arguments: string; // JSON字符串
  };
}

/**
 * 工具结果内容
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_call_id: string;
  content: string;
}

/**
 * 消息内容
 */
export type MessageContent = TextContent | ImageContent | ToolCallContent | ToolResultContent;

/**
 * 对话消息
 */
export interface Message {
  role: MessageRole;
  content: MessageContent | MessageContent[];
  name?: string; // 用于区分不同的用户或工具
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema对象
  };
}

/**
 * 补全选项
 */
export interface CompletionOptions {
  messages: Message[]; // 替代原有的单一prompt字段
  maxTokens?: number;
  temperature?: number;
  model?: string;
  apiKey?: string;
  stream?: boolean;
  onUpdate?: (content: string) => void;
  tools?: ToolDefinition[]; // 可用工具定义
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }; // 工具选择
  response_format?: { type: 'text' | 'json_object' }; // 响应格式
  systemPrompt?: string; // 系统提示（向后兼容，会被转换为system角色消息）
}

/**
 * 工具调用响应
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
 * 补全响应
 */
export interface CompletionResponse {
  content: string;
  model: string;
  finishReason?: string;
  toolCalls?: ToolCall[]; // 工具调用
  responseFormat?: 'text' | 'json_object'; // 响应格式
  rawResponse?: any; // 原始响应，用于调试
}

/**
 * LLM客户端基类
 */
export abstract class LLMClient {
  protected apiKey: string;
  protected baseUrl: string;
  
  constructor(apiKey: string, baseUrl: string = '') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * 执行文本补全
   */
  abstract completion(options: CompletionOptions): Promise<CompletionResponse>;
  
  /**
   * 向后兼容处理单一prompt
   * @param options 可能包含旧格式prompt的选项
   * @returns 标准化后的选项
   */
  protected normalizeOptions(options: CompletionOptions & { prompt?: string }): CompletionOptions {
    const normalizedOptions = { ...options };
    
    // 如果存在旧的prompt字段，将其转换为消息格式
    if ('prompt' in normalizedOptions && normalizedOptions.prompt) {
      // 如果没有messages字段或为空数组，则使用prompt创建一个用户消息
      if (!normalizedOptions.messages || normalizedOptions.messages.length === 0) {
        normalizedOptions.messages = [{
          role: 'user',
          content: {
            type: 'text',
            text: normalizedOptions.prompt
          }
        }];
      }
      
      // 删除原始prompt字段
      delete normalizedOptions.prompt;
    }
    
    // 如果有systemPrompt但没有system角色消息，添加一个system角色消息
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
      
      // 删除原始systemPrompt字段
      delete normalizedOptions.systemPrompt;
    }
    
    return normalizedOptions;
  }
}

/**
 * LLM客户端工厂类，用于创建不同的LLM客户端实例
 */
export class LLMClientFactory {
  /**
   * 创建LLM客户端实例
   * @param type LLM客户端类型
   * @param apiKey API密钥
   * @param baseUrl 基础URL，某些服务需要自定义
   */
  static async createClient(type: string, apiKey: string, baseUrl?: string): Promise<LLMClient> {
    switch (type) {
      case 'openai':
        const OpenAIModule = await import('./OpenAIClient.js');
        return new OpenAIModule.OpenAIClient(apiKey, baseUrl || '');
      case 'azure-openai':
        const AzureOpenAIModule = await import('./AzureOpenAIClient.js');
        return new AzureOpenAIModule.AzureOpenAIClient(apiKey, baseUrl || '');
      case 'gemini':
        const GeminiModule = await import('./GeminiClient.js');
        return new GeminiModule.GeminiClient(apiKey, baseUrl || '');
      case 'anthropic':
        const AnthropicModule = await import('./AnthropicClient.js');
        return new AnthropicModule.AnthropicClient(apiKey, baseUrl || '');
      default:
        throw new Error(`不支持的LLM客户端类型: ${type}`);
    }
  }
} 