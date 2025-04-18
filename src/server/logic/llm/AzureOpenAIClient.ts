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
 * Azure OpenAI客户端实现
 */
export class AzureOpenAIClient extends LLMClient {
  private deploymentName: string;
  private apiVersion: string;

  constructor(apiKey: string, baseUrl: string, deploymentName: string = 'gpt-35-turbo', apiVersion: string = '2023-05-15') {
    // Azure OpenAI需要完整的资源URL
    super(apiKey, baseUrl);
    this.deploymentName = deploymentName;
    this.apiVersion = apiVersion;
  }

  /**
   * 执行Azure OpenAI文本补全
   */
  async completion(options: CompletionOptions & { prompt?: string }): Promise<CompletionResponse> {
    try {
      // 标准化选项，处理向后兼容
      const normalizedOptions = this.normalizeOptions(options);
      
      // Azure OpenAI端点格式
      const endpoint = `${this.baseUrl}${normalizedOptions.model || this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
      
      // 转换消息格式为OpenAI格式（Azure OpenAI API兼容OpenAI API）
      const openaiMessages = this.convertMessagesToOpenAIFormat(normalizedOptions.messages);
      
      const requestBody: any = {
        messages: openaiMessages,
        temperature: normalizedOptions.temperature ?? 0.7,
        max_tokens: normalizedOptions.maxTokens,
        stream: normalizedOptions.stream || false
      };
      
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
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': normalizedOptions.apiKey || this.apiKey
        },
        body: JSON.stringify(requestBody)
      });
      console.log(`[${new Date().toISOString()}] POST ${endpoint} ${response.status} - ${response.statusText}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Azure OpenAI API错误: ${error.error?.message || response.statusText}`);
      }

      if (normalizedOptions.stream && response.body && normalizedOptions.onUpdate) {
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let content = '';
        const toolCalls: ToolCall[] = [];

        const processStream = async (): Promise<CompletionResponse> => {
          const { done, value } = await reader.read();
          
          if (done) {
            return {
              content,
              model: normalizedOptions.model || this.deploymentName,
              finishReason: 'stop',
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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
                
                // 处理常规文本内容
                if (data.choices && data.choices[0]?.delta?.content) {
                  const newContent = data.choices[0].delta.content;
                  content += newContent;
                  if (normalizedOptions.onUpdate) {
                    normalizedOptions.onUpdate(content);
                  }
                }
                
                // 处理工具调用
                if (data.choices && data.choices[0]?.delta?.tool_calls) {
                  const deltaToolCalls = data.choices[0].delta.tool_calls;
                  
                  for (const deltaTool of deltaToolCalls) {
                    // 查找现有工具调用或创建新的
                    let toolCall = toolCalls.find(tc => tc.id === deltaTool.id);
                    
                    if (!toolCall && deltaTool.id) {
                      toolCall = {
                        id: deltaTool.id,
                        type: 'function',
                        function: {
                          name: '',
                          arguments: ''
                        }
                      };
                      toolCalls.push(toolCall);
                    }
                    
                    if (toolCall && deltaTool.function) {
                      if (deltaTool.function.name) {
                        toolCall.function.name = deltaTool.function.name;
                      }
                      
                      if (deltaTool.function.arguments) {
                        toolCall.function.arguments += deltaTool.function.arguments;
                      }
                    }
                  }
                  
                  // 如果有工具调用，同时更新内容
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
        
        // 提取响应内容
        let responseContent = '';
        const toolCalls: ToolCall[] = [];
        
        if (data.choices && data.choices[0]?.message) {
          const message = data.choices[0].message;
          
          // 提取文本内容
          if (typeof message.content === 'string') {
            responseContent = message.content;
          }
          
          // 提取工具调用
          if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
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
          model: data.model || normalizedOptions.model || this.deploymentName,
          finishReason: data.choices[0]?.finish_reason,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          responseFormat: normalizedOptions.response_format?.type,
          rawResponse: data // 保留原始响应以便调试
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Azure OpenAI补全请求失败: ${errorMessage}`);
    }
  }
  
  /**
   * 将消息转换为OpenAI API格式
   */
  private convertMessagesToOpenAIFormat(messages: Message[]): any[] {
    return messages.map(message => {
      const openaiMessage: any = {
        role: message.role
      };
      
      // 处理名称字段（如果存在）
      if (message.name) {
        openaiMessage.name = message.name;
      }
      
      // 处理内容
      if (Array.isArray(message.content)) {
        // 处理多部分内容
        openaiMessage.content = message.content.map(content => this.convertContentToOpenAIFormat(content));
      } else {
        // 处理单一内容
        const content = this.convertContentToOpenAIFormat(message.content);
        
        // 如果是简单的文本内容，则直接使用字符串
        if (content.type === 'text') {
          openaiMessage.content = content.text;
        } else {
          openaiMessage.content = [content];
        }
      }
      
      return openaiMessage;
    });
  }
  
  /**
   * 将内容对象转换为OpenAI API格式
   */
  private convertContentToOpenAIFormat(content: MessageContent): any {
    switch (content.type) {
      case 'text':
        return {
          type: 'text',
          text: (content as TextContent).text
        };
        
      case 'image_url':
        const imageContent = content as ImageContent;
        return {
          type: 'image_url',
          image_url: {
            url: imageContent.image_url.url,
          }
        };
        
      case 'tool_call':
        const toolCallContent = content as ToolCallContent;
        return {
          type: 'tool_call',
          tool_call_id: toolCallContent.tool_call_id,
          function: {
            name: toolCallContent.function.name,
            arguments: toolCallContent.function.arguments
          }
        };
        
      case 'tool_result':
        const toolResultContent = content as ToolResultContent;
        return {
          type: 'tool_result',
          tool_call_id: toolResultContent.tool_call_id,
          content: toolResultContent.content
        };
        
      default:
        throw new Error(`不支持的内容类型: ${(content as any).type}`);
    }
  }
} 