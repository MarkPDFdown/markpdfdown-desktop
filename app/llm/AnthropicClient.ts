import { 
  LLMClient, 
  CompletionOptions, 
  CompletionResponse, 
  Message, 
  MessageContent, 
  TextContent,
  ImageContent
} from './LLMClient';

/**
 * Anthropic客户端实现
 */
export class AnthropicClient extends LLMClient {
  private apiVersion: string;

  constructor(apiKey: string, baseUrl?: string, apiVersion: string = '2023-06-01') {
    super(apiKey, baseUrl || 'https://api.anthropic.com/v1');
    this.apiVersion = apiVersion;
  }

  /**
   * 执行Anthropic文本补全
   */
  async completion(options: CompletionOptions & { prompt?: string }): Promise<CompletionResponse> {
    try {
      // 标准化选项，处理向后兼容
      const normalizedOptions = this.normalizeOptions(options);
      
      const endpoint = `${this.baseUrl}/messages`;
      const modelName = normalizedOptions.model || 'claude-3-opus-20240229';
      
      // 将消息转换为Anthropic格式
      const anthropicMessages = this.convertMessagesToAnthropicFormat(normalizedOptions.messages);
      
      const requestBody: any = {
        model: modelName,
        messages: anthropicMessages,
        temperature: normalizedOptions.temperature ?? 0.7,
        max_tokens: normalizedOptions.maxTokens,
        stream: normalizedOptions.stream || false
      };
      
      // Anthropic支持System指令，而不是作为一个普通消息
      const systemMessage = normalizedOptions.messages.find(msg => msg.role === 'system');
      if (systemMessage) {
        const systemContent = Array.isArray(systemMessage.content) 
          ? systemMessage.content.filter(c => c.type === 'text').map(c => (c as TextContent).text).join('\n')
          : systemMessage.content.type === 'text' ? (systemMessage.content as TextContent).text : '';
          
        if (systemContent) {
          requestBody.system = systemContent;
        }
      }
      
      // Claude没有直接的JSON响应格式，但可以通过系统指令引导
      if (normalizedOptions.response_format?.type === 'json_object' && !requestBody.system) {
        requestBody.system = "请以有效的JSON格式提供响应。";
      } else if (normalizedOptions.response_format?.type === 'json_object' && requestBody.system) {
        requestBody.system += "\n\n请以有效的JSON格式提供响应。";
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': normalizedOptions.apiKey || this.apiKey,
          'anthropic-version': this.apiVersion
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Anthropic API错误: ${error.error?.message || response.statusText}`);
      }

      if (normalizedOptions.stream && response.body && normalizedOptions.onUpdate) {
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let content = '';

        const processStream = async (): Promise<CompletionResponse> => {
          const { done, value } = await reader.read();
          
          if (done) {
            return {
              content,
              model: modelName,
              finishReason: 'stop',
              responseFormat: normalizedOptions.response_format?.type
            };
          }

          // 解析流式响应数据
          const chunk = decoder.decode(value);
          const lines = chunk
            .split('\n')
            .filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // Claude 3使用content_block_delta类型流式传输内容
                if (data.type === 'content_block_delta' && data.delta?.text) {
                  content += data.delta.text;
                  if (normalizedOptions.onUpdate) {
                    normalizedOptions.onUpdate(content);
                  }
                }
                
                // 兼容Claude 2流式响应格式
                if (data.completion) {
                  const newContent = data.completion;
                  content = newContent; // Claude 2返回完整内容，而不是增量
                  if (normalizedOptions.onUpdate) {
                    normalizedOptions.onUpdate(content);
                  }
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }

          return processStream();
        };

        return processStream();
      } else {
        // 处理普通响应
        const data = await response.json();
        
        // Claude API返回格式
        let content = '';
        
        // Claude 3格式
        if (data.content) {
          // 提取所有文本块
          for (const block of data.content) {
            if (block.type === 'text') {
              content += block.text;
            }
          }
        } 
        // 兼容Claude 2格式
        else if (data.completion) {
          content = data.completion;
        }
        
        return {
          content,
          model: data.model,
          finishReason: data.stop_reason,
          responseFormat: normalizedOptions.response_format?.type,
          rawResponse: data // 保留原始响应以便调试
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Anthropic补全请求失败: ${errorMessage}`);
    }
  }
  
  /**
   * 将消息转换为Anthropic API格式
   * Claude API移除系统消息，这将在请求体中单独处理
   */
  private convertMessagesToAnthropicFormat(messages: Message[]): any[] {
    return messages
      .filter(msg => msg.role !== 'system') // 系统消息会在请求体中单独处理
      .map(message => {
        // Anthropic只支持user和assistant角色
        let role = message.role === 'user' ? 'user' : 'assistant';
        
        // 将tool角色视为user角色
        if (message.role === 'tool') {
          role = 'user';
        }
        
        const anthropicMessage: any = {
          role
        };
        
        // 处理内容
        if (Array.isArray(message.content)) {
          anthropicMessage.content = this.convertContentArrayToAnthropicFormat(message.content);
        } else {
          anthropicMessage.content = this.convertContentToAnthropicFormat(message.content);
        }
        
        return anthropicMessage;
      });
  }
  
  /**
   * 将内容数组转换为Anthropic内容格式
   */
  private convertContentArrayToAnthropicFormat(contentArray: MessageContent[]): any[] {
    return contentArray.map(content => this.convertContentToAnthropicFormat(content)).flat();
  }
  
  /**
   * 将单个内容转换为Anthropic内容格式
   */
  private convertContentToAnthropicFormat(content: MessageContent): any[] {
    switch (content.type) {
      case 'text':
        return [{
          type: 'text',
          text: (content as TextContent).text
        }];
        
      case 'image':
        const imageContent = content as ImageContent;
        
        let source: any;
        if (imageContent.image_url.startsWith('data:')) {
          // 处理Base64数据URI
          const parts = imageContent.image_url.split(';base64,');
          if (parts.length === 2) {
            const mediaType = parts[0].replace('data:', '');
            source = {
              type: 'base64',
              media_type: mediaType,
              data: parts[1]
            };
          }
        } else {
          // 处理URL
          source = {
            type: 'url',
            url: imageContent.image_url
          };
        }
        
        return [{
          type: 'image',
          source
        }];
        
      // Anthropic不支持工具调用和工具结果，将其转换为文本
      case 'tool_call':
      case 'tool_result':
        return [{
          type: 'text',
          text: JSON.stringify(content)
        }];
        
      default:
        throw new Error(`Anthropic不支持的内容类型: ${(content as any).type}`);
    }
  }
} 