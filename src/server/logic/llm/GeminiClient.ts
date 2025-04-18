import { 
  LLMClient, 
  CompletionOptions, 
  CompletionResponse, 
  Message, 
  MessageContent, 
  TextContent,
  ImageContent
} from './LLMClient.js';

/**
 * Google Gemini客户端实现
 */
export class GeminiClient extends LLMClient {
  constructor(apiKey: string, baseUrl?: string) {
    super(apiKey, baseUrl || 'https://generativelanguage.googleapis.com/v1/models');
  }

  /**
   * 执行Gemini文本补全
   */
  async completion(options: CompletionOptions & { prompt?: string }): Promise<CompletionResponse> {
    try {
      // 标准化选项，处理向后兼容
      const normalizedOptions = this.normalizeOptions(options);
      
      const modelName = normalizedOptions.model || 'gemini-1.5-pro';
      const endpoint = `${this.baseUrl}/${modelName}:generateContent?key=${normalizedOptions.apiKey || this.apiKey}`;
      
      // 将消息转换为Gemini格式
      const geminiContents = this.convertMessagesToGeminiFormat(normalizedOptions.messages);
      
      const requestBody: any = {
        contents: geminiContents,
        generationConfig: {
          temperature: normalizedOptions.temperature ?? 0.7,
          maxOutputTokens: normalizedOptions.maxTokens,
          topP: 0.95
        }
      };
      
      // 添加响应格式（如果指定）
      if (normalizedOptions.response_format?.type === 'json_object') {
        // Gemini使用不同的键来指定JSON输出
        requestBody.generationConfig.response_mime_type = 'application/json';
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      console.log(`[${new Date().toISOString()}] POST ${endpoint} ${response.status} - ${response.statusText}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API错误: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      // Gemini API返回格式与其他模型不同
      if (data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        let content = '';
        
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              content += part.text;
            }
          }
        }
        
        return {
          content,
          model: modelName,
          finishReason: candidate.finishReason,
          responseFormat: normalizedOptions.response_format?.type,
          rawResponse: data // 保留原始响应以便调试
        };
      }
      
      throw new Error('Gemini API返回格式错误');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Gemini补全请求失败: ${errorMessage}`);
    }
  }
  
  /**
   * 将消息转换为Gemini API格式
   */
  private convertMessagesToGeminiFormat(messages: Message[]): any[] {
    const geminiContents: any[] = [];
    let currentRole: string | null = null;
    let currentContent: any[] = [];
    
    // Gemini有不同的消息格式，需要相邻的相同角色消息合并
    for (const message of messages) {
      // 跳过System消息，因为Gemini不直接支持，稍后会特殊处理
      if (message.role === 'system') {
        continue;
      }
      
      // 如果角色变化，创建新的内容块
      const geminiRole = this.mapRoleToGemini(message.role);
      if (currentRole !== geminiRole && currentContent.length > 0) {
        geminiContents.push({
          role: currentRole,
          parts: currentContent
        });
        currentContent = [];
      }
      
      currentRole = geminiRole;
      
      // 处理消息内容
      if (Array.isArray(message.content)) {
        // 处理多部分内容
        for (const content of message.content) {
          currentContent.push(this.convertContentToGeminiFormat(content));
        }
      } else {
        // 处理单一内容
        currentContent.push(this.convertContentToGeminiFormat(message.content));
      }
    }
    
    // 添加最后一组消息
    if (currentRole && currentContent.length > 0) {
      geminiContents.push({
        role: currentRole,
        parts: currentContent
      });
    }
    
    // 特殊处理系统消息：将系统消息添加到第一个用户消息的前面
    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (systemMessages.length > 0 && geminiContents.length > 0 && geminiContents[0].role === 'user') {
      for (const sysMsg of systemMessages) {
        const text = Array.isArray(sysMsg.content) 
          ? sysMsg.content.map(c => c.type === 'text' ? (c as TextContent).text : '').join('\n')
          : sysMsg.content.type === 'text' ? (sysMsg.content as TextContent).text : '';
          
        if (text) {
          // 在用户消息前添加系统指令
          if (typeof geminiContents[0].parts[0] === 'object' && geminiContents[0].parts[0].text) {
            geminiContents[0].parts[0].text = `[System Instructions]: ${text}\n\n${geminiContents[0].parts[0].text}`;
          }
        }
      }
    }
    
    return geminiContents;
  }
  
  /**
   * 将内容对象转换为Gemini API格式
   */
  private convertContentToGeminiFormat(content: MessageContent): any {
    switch (content.type) {
      case 'text':
        return {
          text: (content as TextContent).text
        };
        
      case 'image_url':
        const imageContent = content as ImageContent;
        return {
          inline_data: {
            mime_type: this.getMimeTypeFromUrl(imageContent.image_url.url),
            data: this.extractBase64FromUrl(imageContent.image_url.url)
          }
        };
        
      // Gemini不直接支持工具调用和工具结果
      case 'tool_call':
      case 'tool_result':
        // 将工具相关内容转换为文本
        return {
          text: JSON.stringify(content)
        };
        
      default:
        throw new Error(`Gemini不支持的内容类型: ${(content as any).type}`);
    }
  }
  
  /**
   * 从URL中提取MIME类型
   */
  private getMimeTypeFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      const mimeMatch = url.match(/^data:([^;]+);/);
      return mimeMatch ? mimeMatch[1] : 'image/jpeg';
    }
    
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }
  
  /**
   * 从数据URL中提取base64数据
   */
  private extractBase64FromUrl(url: string): string {
    if (url.startsWith('data:')) {
      return url.split(',')[1];
    }
    
    // 对于非数据URL，需要先获取图像数据
    // 在实际应用中，这里可能需要进行异步请求获取图像并转换为base64
    // 这里简化处理，返回空字符串
    return '';
  }
  
  /**
   * 将角色映射到Gemini支持的角色
   */
  private mapRoleToGemini(role: string): string {
    switch (role) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'model';
      case 'system':
        // Gemini不直接支持系统角色，将在处理中特殊处理
        return 'user';
      case 'tool':
        // Gemini不直接支持工具角色，将其视为用户输入
        return 'user';
      default:
        return 'user';
    }
  }
} 