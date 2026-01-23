import { describe, it, expect } from 'vitest'
import { LLMClientFactory } from '../LLMClient.js'

describe('LLMClientFactory', () => {
  describe('createClient', () => {
    it('should create OpenAI client', async () => {
      const client = await LLMClientFactory.createClient('openai', 'test-key', 'https://api.openai.com')
      expect(client).toBeDefined()
      expect(client.constructor.name).toBe('OpenAIClient')
    })

    it('should create OpenAI Responses client', async () => {
      const client = await LLMClientFactory.createClient('openai-responses', 'test-key', 'https://api.openai.com')
      expect(client).toBeDefined()
      expect(client.constructor.name).toBe('OpenAIResponsesClient')
    })

    it('should create Anthropic client', async () => {
      const client = await LLMClientFactory.createClient('anthropic', 'test-key', 'https://api.anthropic.com')
      expect(client).toBeDefined()
      expect(client.constructor.name).toBe('AnthropicClient')
    })

    it('should create Gemini client', async () => {
      const client = await LLMClientFactory.createClient('gemini', 'test-key', 'https://api.google.com')
      expect(client).toBeDefined()
      expect(client.constructor.name).toBe('GeminiClient')
    })

    it('should create Ollama client', async () => {
      const client = await LLMClientFactory.createClient('ollama', '', 'http://localhost:11434')
      expect(client).toBeDefined()
      expect(client.constructor.name).toBe('OllamaClient')
    })

    it('should throw error for unsupported client type', async () => {
      await expect(
        LLMClientFactory.createClient('unsupported', 'key', 'url')
      ).rejects.toThrow('不支持的LLM客户端类型: unsupported')
    })

    it('should handle empty baseUrl', async () => {
      const client = await LLMClientFactory.createClient('openai', 'test-key', '')
      expect(client).toBeDefined()
    })

    it('should pass apiKey to client', async () => {
      const client = await LLMClientFactory.createClient('openai', 'custom-key-123')
      expect(client['apiKey']).toBe('custom-key-123')
    })
  })
})
