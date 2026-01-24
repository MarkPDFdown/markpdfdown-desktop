// @ts-expect-error - ProviderRepository import may have type issues
import providerRepository from '../../domain/repositories/ProviderRepository.js';
import { LLMClientFactory, CompletionOptions, Message } from '../../infrastructure/adapters/llm/LLMClient.js';
import sharp from 'sharp';


// 根据服务商ID获取LLM客户端
const getLLMClient = async (providerId: number) => {
    const provider = await providerRepository.findById(providerId);

    if (!provider) {
        throw new Error('服务商不存在');
    }

    // 获取 base_url 和 suffix
    let baseUrl = provider.base_url || '';
    let suffix = provider.suffix || '';

    // 根据 provider 类型设置默认值
    if (!baseUrl) {
        switch (provider.type) {
            case 'ollama':
                baseUrl = 'http://localhost:11434/api';
                break;
        }
    }

    if (!suffix) {
        switch (provider.type) {
            case 'openai':
                suffix = '/chat/completions';
                break;
            case 'openai-responses':
                suffix = '/responses';
                break;
            case 'gemini':
                suffix = '/models';
                break;
            case 'anthropic':
                suffix = '/messages';
                break;
            case 'ollama':
                suffix = '/generate';
                break;
        }
    }

    return LLMClientFactory.createClient(
        provider.type || '',
        provider.api_key || '',
        `${baseUrl}${suffix}`
    );
}

// 补全请求
const completion = async (providerId: number, options: CompletionOptions) => {
    const llmClient = await getLLMClient(providerId);
    return llmClient.completion(options);
}

// 输入图片文件路径，返回图片的base64编码字符串
const getImageBase64 = async (imagePath: string): Promise<string> => {
    const image = sharp(imagePath);
    const buffer = await image.toBuffer();
    return buffer.toString('base64');
}

// 输入图片文件路径，构造Message
const transformImageMessage = async (imagePath: string) => {
    const imageBase64 = await getImageBase64(imagePath);
    const message: Message[] = [{
        role: 'system',
        content: {
            type: 'text',
            text: 'You are a helpful assistant that can convert images to Markdown format. You are given an image, and you need to convert it to Markdown format. Please output the Markdown content only, without any other text.'
        }
    }];
    message.push({
        role: 'user',
        content: [
            {
                type: 'text',
                text: `Below is the image of one page of a document, please read the content in the image and transcribe it into plain Markdown format. Please note:
1. Identify heading levels, text styles, formulas, and the format of table rows and columns
2. Mathematical formulas should be transcribed using LaTeX syntax, ensuring consistency with the original
3. Please output the Markdown content only, without any other text.

Output Example:
\`\`\`markdown
{example}
\`\`\``
            },
            {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
        ]
    });

    return message;
}



export default {
    completion,
    transformImageMessage
}
