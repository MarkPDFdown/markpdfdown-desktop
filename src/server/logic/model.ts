// @ts-ignore
import providerDal from '../dal/providerDal.js';
import { LLMClientFactory, CompletionOptions, Message } from './llm/LLMClient.js';


// 根据服务商ID获取LLM客户端
const getLLMClient = async (providerId: number) => {
    const provider = await providerDal.findById(providerId);
    
    if (!provider) {
        throw new Error('服务商不存在');
    }
    
    return LLMClientFactory.createClient(
        provider.type || '', 
        provider.api_key || '', 
        `${provider.base_url || ''}${provider.suffix || ''}`
    );
}

// 补全请求
const completion = async (providerId: number, modelId: string, messages: Message[], options: CompletionOptions | undefined) => {
    const llmClient = await getLLMClient(providerId);
    // 从options中提取除messages外的其他选项
    const { messages: _messages, model: _model, ...otherOptions } = options || {};
    
    // 按CompletionOptions格式转换messages
    const completionOptions: CompletionOptions = {
        messages: messages,
        model: modelId,
        ...otherOptions
    }
    
    return llmClient.completion(completionOptions);
}

export default {
    completion
}