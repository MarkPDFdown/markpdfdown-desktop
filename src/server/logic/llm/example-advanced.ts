import { LLMClientFactory, Message, ToolDefinition } from './LLMClient.js';

/**
 * 高级功能示例：多轮对话、多角色和图片支持
 */
async function advancedExample() {
  try {
    // 创建OpenAI客户端
    const openaiClient = await LLMClientFactory.createClient('openai', 'your-openai-api-key');
    
    // 1. 基本多轮对话示例
    console.log('=== 多轮对话示例 ===');
    const chatMessages: Message[] = [
      {
        role: 'system',
        content: {
          type: 'text',
          text: '你是一个专业的AI助手，善于回答用户的问题。请简短、直接地回答。'
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: '你好，我想了解一下人工智能。'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: '人工智能是计算机科学的一个分支，旨在创建能够像人类一样思考和学习的智能机器。它包括机器学习、深度学习、自然语言处理等领域。有什么具体方面你想了解的吗？'
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: '自然语言处理是什么？'
        }
      }
    ];
    
    const chatResponse = await openaiClient.completion({
      messages: chatMessages,
      model: 'gpt-4'
    });
    
    console.log('对话响应:', chatResponse.content);
    
    // 2. 图片分析示例
    console.log('\n=== 图片分析示例 ===');
    const imageMessages: Message[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '这张图片是什么？请详细描述一下。'
          },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/sample-image.jpg' }, // 请替换为实际图片URL
          }
        ]
      }
    ];
    
    const imageResponse = await openaiClient.completion({
      messages: imageMessages,
      model: 'gpt-4-vision-preview' // 支持图像的模型
    });
    
    console.log('图片分析响应:', imageResponse.content);
    
    // 3. 工具调用示例
    console.log('\n=== 工具调用示例 ===');
    
    // 定义一个简单的计算器工具
    const calculatorTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'calculate',
        description: '执行基本数学计算',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['add', 'subtract', 'multiply', 'divide'],
              description: '要执行的操作'
            },
            a: {
              type: 'number',
              description: '第一个操作数'
            },
            b: {
              type: 'number',
              description: '第二个操作数'
            }
          },
          required: ['operation', 'a', 'b']
        }
      }
    };
    
    const toolMessages: Message[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: '我需要计算123乘以456是多少'
        }
      }
    ];
    
    const toolResponse = await openaiClient.completion({
      messages: toolMessages,
      model: 'gpt-4',
      tools: [calculatorTool],
      tool_choice: 'auto'
    });
    
    console.log('工具调用响应:', toolResponse);
    
    // 如果有工具调用，处理它并继续对话
    if (toolResponse.toolCalls && toolResponse.toolCalls.length > 0) {
      const toolCall = toolResponse.toolCalls[0];
      console.log('工具调用:', toolCall.function.name);
      console.log('参数:', toolCall.function.arguments);
      
      // 解析参数
      const args = JSON.parse(toolCall.function.arguments);
      
      // 执行计算
      let result: number;
      switch (args.operation) {
        case 'add':
          result = args.a + args.b;
          break;
        case 'subtract':
          result = args.a - args.b;
          break;
        case 'multiply':
          result = args.a * args.b;
          break;
        case 'divide':
          result = args.a / args.b;
          break;
        default:
          throw new Error(`不支持的操作: ${args.operation}`);
      }
      
      // 继续对话，添加工具响应
      const toolResultMessages: Message[] = [
        ...toolMessages,
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: toolResponse.content
          }
        },
        {
          role: 'tool',
          content: {
            type: 'tool_result',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ result })
          }
        }
      ];
      
      const finalResponse = await openaiClient.completion({
        messages: toolResultMessages,
        model: 'gpt-4'
      });
      
      console.log('最终响应:', finalResponse.content);
    }
    
    // 4. JSON 响应格式示例
    console.log('\n=== JSON响应格式示例 ===');
    const jsonMessages: Message[] = [
      {
        role: 'system',
        content: {
          type: 'text',
          text: '你是一个API服务，返回结构化的JSON数据。'
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: '给我三本经典科幻小说的信息，包括书名、作者和出版年份。'
        }
      }
    ];
    
    const jsonResponse = await openaiClient.completion({
      messages: jsonMessages,
      model: 'gpt-4',
      response_format: { type: 'json_object' }
    });
    
    console.log('JSON响应:', jsonResponse.content);
    console.log('解析后的JSON:', JSON.parse(jsonResponse.content));
    
  } catch (error) {
    console.error('示例运行出错:', error);
  }
}

// 辅助函数：将图片文件转换为base64数据URI（用于本地文件）
export function imageToDataURI(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    
    fs.readFile(filePath, (err: any, data: Buffer) => {
      if (err) {
        reject(err);
        return;
      }
      
      // 获取文件扩展名
      const extension = filePath.split('.').pop()?.toLowerCase();
      let mimeType: string;
      
      switch (extension) {
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        case 'png':
          mimeType = 'image/png';
          break;
        case 'gif':
          mimeType = 'image/gif';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        default:
          mimeType = 'application/octet-stream';
      }
      
      const base64Data = data.toString('base64');
      const dataURI = `data:${mimeType};base64,${base64Data}`;
      
      resolve(dataURI);
    });
  });
}

// 运行示例
// advancedExample().catch(console.error);

// 导出函数
export { advancedExample }; 