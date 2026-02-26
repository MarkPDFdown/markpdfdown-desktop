import {
  LLMClient,
  CompletionOptions,
  CompletionResponse,
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent
} from './LLMClient.js';

/**
 * Ollama客户端实现
 */
export class OllamaClient extends LLMClient {
  constructor(apiKey: string, baseUrl?: string) {
    super(apiKey, baseUrl || 'http://localhost:11434/api');
  }

  /**
   * 执行Ollama文本补全
   */
  async completion(options: CompletionOptions & { prompt?: string }): Promise<CompletionResponse> {
    try {
      // 标准化选项，处理向后兼容
      const normalizedOptions = this.normalizeOptions(options);

      // 转换消息格式为Ollama格式
      const ollamaMessages = this.convertMessagesToOllamaFormat(normalizedOptions.messages);

      const requestBody: any = {
        model: normalizedOptions.model || 'llama3',
        messages: ollamaMessages,
        stream: normalizedOptions.stream !== false, // 默认为流式响应
        options: {}
      };

      // 添加额外选项
      if (normalizedOptions.temperature !== undefined) {
        requestBody.options.temperature = normalizedOptions.temperature;
      }

      // 只在提供了有效的 maxTokens 时才添加到请求体
      if (typeof normalizedOptions.maxTokens === 'number' && normalizedOptions.maxTokens > 0) {
        requestBody.options.num_predict = normalizedOptions.maxTokens;
      }

      // 添加工具配置（如果有）
      if (normalizedOptions.tools && normalizedOptions.tools.length > 0) {
        requestBody.tools = normalizedOptions.tools;
      }

      // 添加响应格式（如果指定）
      if (normalizedOptions.response_format?.type === 'json_object') {
        requestBody.format = 'json';
      }

      const response = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Title': 'MarkPDFdown',
          'HTTP-Referer': 'https://github.com/MarkPDFdown'
        },
        body: JSON.stringify(requestBody)
      });
      console.log(`[${new Date().toISOString()}] POST ${this.baseUrl} (model: ${requestBody.model}) ${response.status} - ${response.statusText}`);
      // console.log(JSON.stringify(requestBody));

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Ollama API错误: ${error.error || response.statusText}`);
      }

      if (normalizedOptions.stream && response.body && normalizedOptions.onUpdate) {
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let content = '';
        let model = '';

        const processStream = async (): Promise<CompletionResponse> => {
          const { done, value } = await reader.read();

          if (done) {
            return {
              content,
              model: model || normalizedOptions.model || 'llama3',
              finishReason: 'stop',
              responseFormat: normalizedOptions.response_format?.type
            };
          }

          // 解析流式响应数据
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            try {
              const data = JSON.parse(line);

              // 存储模型名称
              if (data.model && !model) {
                model = data.model;
              }

              // 提取消息内容
              if (data.message && data.message.content) {
                if (!data.done) {
                  // 累加流式内容
                  content += data.message.content;
                  if (normalizedOptions.onUpdate) {
                    normalizedOptions.onUpdate(content);
                  }
                }
              }

              // 如果是最后一条消息，可以直接返回结果
              if (data.done === true) {
                return {
                  content,
                  model: data.model || normalizedOptions.model || 'llama3',
                  finishReason: 'stop',
                  responseFormat: normalizedOptions.response_format?.type,
                  rawResponse: data
                };
              }
            } catch {
              // 忽略解析错误
            }
          }

          return processStream();
        };

        return processStream();
      } else {
        // 处理非流式响应
        const data = await response.json();

        return {
          content: data.message?.content || '',
          model: data.model,
          finishReason: data.done ? 'stop' : undefined,
          responseFormat: normalizedOptions.response_format?.type,
          rawResponse: data // 保留原始响应以便调试
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Ollama补全请求失败: ${errorMessage}`);
    }
  }

  /**
   * 将消息转换为Ollama API格式
   */
  private convertMessagesToOllamaFormat(messages: Message[]): any[] {
    return messages.map(message => {
      const ollamaMessage: any = {
        role: message.role
      };

      // 处理内容
      if (Array.isArray(message.content)) {
        // 处理多部分内容
        ollamaMessage.content = this.convertContentArrayToOllamaFormat(message.content);
      } else {
        // 处理单一内容
        ollamaMessage.content = this.convertContentToOllamaFormat(message.content);
      }

      // 处理图片（如果是多模态模型）
      const images = this.extractImages(message.content);
      if (images.length > 0) {
        ollamaMessage.images = images;
      }

      return ollamaMessage;
    });
  }

  /**
   * 提取消息中的图片
   */
  private extractImages(content: MessageContent | MessageContent[]): string[] {
    const images: string[] = [];

    if (Array.isArray(content)) {
      // 从内容数组中提取图片
      for (const item of content) {
        if (item.type === 'image_url') {
          const imageContent = item as ImageContent;
          images.push(this.processImageUrl(imageContent.image_url.url));
        }
      }
    } else if (content.type === 'image_url') {
      // 从单个图片内容中提取
      const imageContent = content as ImageContent;
      images.push(this.processImageUrl(imageContent.image_url.url));
    }

    return images;
  }

  /**
   * 处理图片 URL，去掉 data URI 前缀
   */
  private processImageUrl(url: string): string {
    // 如果是 data URI，移除前缀
    if (url.startsWith('data:')) {
      const parts = url.split(';base64,');
      if (parts.length === 2) {
        return parts[1]; // 只返回 base64 编码部分
      }
    }
    return url;
  }

  /**
   * 将内容数组转换为Ollama内容格式
   */
  private convertContentArrayToOllamaFormat(contentArray: MessageContent[]): string {
    return contentArray
      .map(content => this.convertContentToOllamaFormat(content))
      .join('\n');
  }

  /**
   * 将单个内容转换为Ollama内容格式
   */
  private convertContentToOllamaFormat(content: MessageContent): string {
    switch (content.type) {
      case 'text':
        return (content as TextContent).text;

      case 'image_url':
        // 图片会单独处理到images字段，这里只返回提示
        return '';

      case 'tool_call': {
        const toolCall = content as ToolCallContent;
        return JSON.stringify({
          tool_call_id: toolCall.tool_call_id,
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          }
        });
      }

      case 'tool_result': {
        const toolResult = content as ToolResultContent;
        return JSON.stringify({
          tool_call_id: toolResult.tool_call_id,
          content: toolResult.content
        });
      }

      default:
        return '';
    }
  }
}
