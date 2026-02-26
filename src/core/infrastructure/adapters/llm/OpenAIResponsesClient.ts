import {
  LLMClient,
  CompletionOptions,
  CompletionResponse,
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent,
  ToolCall
} from './LLMClient.js';

/**
 * OpenAI Responses API客户端实现
 * 使用新的 /v1/responses 端点
 */
export class OpenAIResponsesClient extends LLMClient {
  constructor(apiKey: string, baseUrl?: string) {
    super(apiKey, baseUrl || 'https://api.openai.com/v1/responses');
  }

  /**
   * 执行OpenAI Responses API补全
   */
  async completion(options: CompletionOptions & { prompt?: string }): Promise<CompletionResponse> {
    try {
      // 标准化选项，处理向后兼容
      const normalizedOptions = this.normalizeOptions(options);

      // 转换消息格式为Responses API格式
      const { input, instructions } = this.convertMessagesToResponsesFormat(normalizedOptions.messages);

      const requestBody: any = {
        model: normalizedOptions.model || 'gpt-4o',
        input: input,
        temperature: normalizedOptions.temperature ?? 0.7,
        stream: normalizedOptions.stream || false
      };

      // 只在提供了 maxTokens 时才添加到请求体
      if (normalizedOptions.maxTokens !== undefined) {
        requestBody.max_tokens = normalizedOptions.maxTokens;
      }

      // 添加系统指令（如果有）
      if (instructions) {
        requestBody.instructions = instructions;
      }

      // 添加工具配置（如果有）
      if (normalizedOptions.tools && normalizedOptions.tools.length > 0) {
        requestBody.tools = normalizedOptions.tools;

        if (normalizedOptions.tool_choice) {
          requestBody.tool_choice = normalizedOptions.tool_choice;
        }
      }

      // 添加响应格式（如果指定）
      if (normalizedOptions.response_format) {
        requestBody.response_format = normalizedOptions.response_format;
      }

      const response = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${normalizedOptions.apiKey || this.apiKey}`,
          'X-Title': 'MarkPDFdown',
          'HTTP-Referer': 'https://github.com/MarkPDFdown'
        },
        body: JSON.stringify(requestBody)
      });
      console.log(`[${new Date().toISOString()}] POST ${this.baseUrl} (model: ${requestBody.model}) ${response.status} - ${response.statusText}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI Responses API错误: ${error.error?.message || response.statusText}`);
      }

      if (normalizedOptions.stream && response.body && normalizedOptions.onUpdate) {
        // 处理流式响应
        return this.handleResponsesStreaming(response, normalizedOptions);
      } else {
        // 处理普通响应
        const data = await response.json();
        return this.parseResponsesOutput(data, normalizedOptions);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI Responses API补全请求失败: ${errorMessage}`);
    }
  }

  /**
   * 将消息转换为Responses API格式
   * 提取system消息作为instructions，其他消息放入input
   */
  private convertMessagesToResponsesFormat(messages: Message[]): { input: any[], instructions?: string } {
    const systemMessages: string[] = [];
    const inputMessages: any[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // 提取system消息内容
        if (typeof message.content === 'string') {
          systemMessages.push(message.content);
        } else if (Array.isArray(message.content)) {
          // 如果是数组，提取所有文本内容
          for (const content of message.content) {
            if (content.type === 'text') {
              systemMessages.push((content as TextContent).text);
            }
          }
        } else if (message.content.type === 'text') {
          systemMessages.push((message.content as TextContent).text);
        }
      } else {
        // 非system消息转换为input格式
        const inputMessage: any = {
          role: message.role
        };

        // 处理名称字段（如果存在）
        if (message.name) {
          inputMessage.name = message.name;
        }

        // 处理内容 - Responses API格式
        if (Array.isArray(message.content)) {
          // 处理多部分内容
          // 检查是否全部是文本内容
          const allText = message.content.every(c => c.type === 'text');

          if (allText) {
            // 如果全是文本，合并为单个字符串
            inputMessage.content = message.content
              .map(c => (c as TextContent).text)
              .join('');
          } else {
            // 混合内容（如文本+图片），使用对象数组格式
            inputMessage.content = message.content.map(content => this.convertContentToResponsesAPIFormat(content));
          }
        } else {
          // 处理单一内容
          if (typeof message.content === 'string') {
            // 如果是字符串，直接使用
            inputMessage.content = message.content;
          } else if (message.content.type === 'text') {
            // 单一文本内容，使用纯字符串
            inputMessage.content = (message.content as TextContent).text;
          } else {
            // 非文本内容，包装为数组
            inputMessage.content = [this.convertContentToResponsesAPIFormat(message.content)];
          }
        }

        inputMessages.push(inputMessage);
      }
    }

    const result: { input: any[], instructions?: string } = {
      input: inputMessages
    };

    // 合并所有system消息为instructions
    if (systemMessages.length > 0) {
      result.instructions = systemMessages.join('\n\n');
    }

    return result;
  }

  /**
   * 将内容对象转换为Responses API格式（用于数组内容）
   * Responses API有不同的内容类型命名
   */
  private convertContentToResponsesAPIFormat(content: MessageContent): any {
    switch (content.type) {
      case 'text':
        // For text content in arrays, use input_text type
        return {
          type: 'input_text',
          text: (content as TextContent).text
        };

      case 'image_url': {
        const imageContent = content as ImageContent;
        return {
          type: 'input_image',  // Responses API uses 'input_image' for user-provided images
          image_url: imageContent.image_url.url,
        };
      }

      case 'tool_call': {
        const toolCallContent = content as ToolCallContent;
        return {
          type: 'function_call',  // Responses API uses 'function_call'
          call_id: toolCallContent.tool_call_id,
          name: toolCallContent.function.name,
          arguments: toolCallContent.function.arguments
        };
      }

      case 'tool_result': {
        const toolResultContent = content as ToolResultContent;
        return {
          type: 'function_call_output',  // Responses API uses 'function_call_output'
          call_id: toolResultContent.tool_call_id,
          output: toolResultContent.content
        };
      }

      default:
        throw new Error(`不支持的内容类型: ${(content as any).type}`);
    }
  }

  /**
   * 解析Responses API的输出
   */
  private parseResponsesOutput(data: any, options: CompletionOptions): CompletionResponse {
    let responseContent = '';
    const toolCalls: ToolCall[] = [];

    // Responses API返回output数组而不是choices
    if (data.output && data.output.length > 0) {
      const outputItem = data.output[0];

      // 提取文本内容
      if (outputItem.content) {
        if (typeof outputItem.content === 'string') {
          responseContent = outputItem.content;
        } else if (Array.isArray(outputItem.content)) {
          // 如果是数组，合并所有文本内容
          responseContent = outputItem.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('');
        }
      }

      // 提取工具调用
      if (outputItem.tool_calls && outputItem.tool_calls.length > 0) {
        for (const toolCall of outputItem.tool_calls) {
          toolCalls.push({
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments
            }
          });
        }
      }
    }

    return {
      content: responseContent,
      model: data.model,
      finishReason: data.output?.[0]?.finish_reason || 'stop',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      responseFormat: options.response_format?.type,
      rawResponse: data // 保留原始响应以便调试
    };
  }

  /**
   * 处理Responses API的流式响应
   * 使用SSE格式: event: <type>\ndata: <json>\n\n
   */
  private async handleResponsesStreaming(
    response: Response,
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let content = '';
    const toolCalls: ToolCall[] = [];
    let finishReason: string | undefined;
    let model = options.model || 'gpt-4o';

    let buffer = '';

    const processStream = async (): Promise<CompletionResponse> => {
      const { done, value } = await reader.read();

      if (done) {
        return {
          content,
          model,
          finishReason: finishReason || 'stop',
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          responseFormat: options.response_format?.type
        };
      }

      // 解析SSE格式的流式响应
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // 保留最后一行（可能不完整）
      buffer = lines.pop() || '';

      let currentEvent: string | null = null;

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine === '') {
          // 空行表示事件结束
          currentEvent = null;
          continue;
        }

        if (trimmedLine.startsWith('event:')) {
          // 解析事件类型
          currentEvent = trimmedLine.substring(6).trim();
        } else if (trimmedLine.startsWith('data:')) {
          // 解析事件数据
          const dataStr = trimmedLine.substring(5).trim();

          if (dataStr === '[DONE]') {
            continue;
          }

          try {
            const data = JSON.parse(dataStr);

            // 处理不同类型的事件
            if (currentEvent === 'response.output_text.delta') {
              // 文本内容增量
              if (data.delta) {
                content += data.delta;
                if (options.onUpdate) {
                  options.onUpdate(content);
                }
              }
            } else if (currentEvent === 'response.output_item.done') {
              // 输出项完成
              if (data.item) {
                // 提取工具调用
                if (data.item.tool_calls && data.item.tool_calls.length > 0) {
                  for (const toolCall of data.item.tool_calls) {
                    toolCalls.push({
                      id: toolCall.id,
                      type: toolCall.type,
                      function: {
                        name: toolCall.function.name,
                        arguments: toolCall.function.arguments
                      }
                    });
                  }
                }
              }
            } else if (currentEvent === 'response.completed') {
              // 响应完成
              if (data.response) {
                model = data.response.model || model;
                finishReason = data.response.output?.[0]?.finish_reason;
              }
            } else if (currentEvent === 'response.tool_calls.delta') {
              // 工具调用增量（流式工具调用）
              if (data.delta && data.index !== undefined) {
                let toolCall = toolCalls[data.index];

                if (!toolCall && data.delta.id) {
                  toolCall = {
                    id: data.delta.id,
                    type: 'function',
                    function: {
                      name: '',
                      arguments: ''
                    }
                  };
                  toolCalls[data.index] = toolCall;
                }

                if (toolCall && data.delta.function) {
                  if (data.delta.function.name) {
                    toolCall.function.name = data.delta.function.name;
                  }

                  if (data.delta.function.arguments) {
                    toolCall.function.arguments += data.delta.function.arguments;
                  }
                }
              }
            }
          } catch (e) {
            // 忽略解析错误
            console.warn('Failed to parse SSE data:', dataStr, e);
          }
        }
      }

      return processStream();
    };

    return processStream();
  }
}
