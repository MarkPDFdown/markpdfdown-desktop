import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LLMClient, CompletionOptions, CompletionResponse } from '../LLMClient.js'

// Create a test implementation of the abstract LLMClient
class TestLLMClient extends LLMClient {
  async completion(options: CompletionOptions): Promise<CompletionResponse> {
    // Simple implementation for testing
    return {
      content: 'test response',
      model: 'test-model',
      finishReason: 'stop'
    }
  }
}

describe('LLMClient', () => {
  let client: TestLLMClient

  beforeEach(() => {
    client = new TestLLMClient('test-api-key', 'https://test.api.com')
  })

  describe('Constructor', () => {
    it('should initialize with apiKey and baseUrl', () => {
      expect(client['apiKey']).toBe('test-api-key')
      expect(client['baseUrl']).toBe('https://test.api.com')
    })

    it('should allow empty baseUrl', () => {
      const emptyClient = new TestLLMClient('key', '')
      expect(emptyClient['baseUrl']).toBe('')
    })
  })

  describe('normalizeOptions - Backward Compatibility', () => {
    it('should convert prompt to messages format when prompt is provided', () => {
      const options = {
        prompt: 'Hello, world!',
        messages: []
      } as any

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toHaveLength(1)
      expect(normalized.messages[0]).toEqual({
        role: 'user',
        content: {
          type: 'text',
          text: 'Hello, world!'
        }
      })
      expect(normalized.prompt).toBeUndefined()
    })

    it('should prioritize messages over prompt when both are provided', () => {
      const options = {
        prompt: 'Old prompt',
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'New message' }
          }
        ]
      } as any

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toHaveLength(1)
      expect(normalized.messages[0].content).toEqual({
        type: 'text',
        text: 'New message'
      })
    })

    it('should not modify when only messages are provided', () => {
      const options: CompletionOptions = {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Test message' }
          }
        ]
      }

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toEqual(options.messages)
      expect(normalized).not.toHaveProperty('prompt')
    })

    it('should handle empty prompt', () => {
      const options = {
        prompt: '',
        messages: []
      } as any

      const normalized = client['normalizeOptions'](options)

      // Empty prompt should not create a message
      expect(normalized.messages).toHaveLength(0)
    })
  })

  describe('normalizeOptions - System Prompt', () => {
    it('should add system message when systemPrompt is provided', () => {
      const options: CompletionOptions = {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        systemPrompt: 'You are a helpful assistant'
      }

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toHaveLength(2)
      expect(normalized.messages[0]).toEqual({
        role: 'system',
        content: {
          type: 'text',
          text: 'You are a helpful assistant'
        }
      })
      expect(normalized.messages[1].role).toBe('user')
      expect(normalized.systemPrompt).toBeUndefined()
    })

    it('should not add duplicate system message if one already exists', () => {
      const options: CompletionOptions = {
        messages: [
          {
            role: 'system',
            content: { type: 'text', text: 'Existing system message' }
          },
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        systemPrompt: 'New system prompt'
      }

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toHaveLength(2)
      const systemMessages = normalized.messages.filter(m => m.role === 'system')
      expect(systemMessages).toHaveLength(1)
      expect(systemMessages[0].content).toEqual({
        type: 'text',
        text: 'Existing system message'
      })
    })

    it('should insert system message at the beginning', () => {
      const options: CompletionOptions = {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Message 1' }
          },
          {
            role: 'assistant',
            content: { type: 'text', text: 'Response 1' }
          }
        ],
        systemPrompt: 'System instruction'
      }

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages[0].role).toBe('system')
      expect(normalized.messages[1].role).toBe('user')
      expect(normalized.messages[2].role).toBe('assistant')
    })
  })

  describe('normalizeOptions - Combined Features', () => {
    it('should handle both prompt and systemPrompt together', () => {
      const options = {
        prompt: 'User question',
        systemPrompt: 'System instruction',
        messages: []
      } as any

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toHaveLength(2)
      expect(normalized.messages[0].role).toBe('system')
      expect(normalized.messages[1].role).toBe('user')
      expect(normalized.prompt).toBeUndefined()
      expect(normalized.systemPrompt).toBeUndefined()
    })

    it('should preserve other options', () => {
      const options: CompletionOptions & { prompt?: string } = {
        prompt: 'Test',
        messages: [],
        model: 'gpt-4',
        temperature: 0.8,
        maxTokens: 1000,
        stream: true
      }

      const normalized = client['normalizeOptions'](options)

      expect(normalized.model).toBe('gpt-4')
      expect(normalized.temperature).toBe(0.8)
      expect(normalized.maxTokens).toBe(1000)
      expect(normalized.stream).toBe(true)
    })

    it('should not mutate the original options object', () => {
      const options = {
        prompt: 'Test prompt',
        messages: [],
        model: 'test-model'
      } as any

      const originalPrompt = options.prompt
      const normalized = client['normalizeOptions'](options)

      expect(options.prompt).toBe(originalPrompt)
      expect(normalized).not.toBe(options)
    })
  })

  describe('normalizeOptions - Edge Cases', () => {
    it('should handle undefined messages array', () => {
      const options = {
        prompt: 'Test'
      } as any

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toBeDefined()
      expect(normalized.messages).toHaveLength(1)
    })

    it('should handle null prompt', () => {
      const options = {
        prompt: null,
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Test' }
          }
        ]
      } as any

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toHaveLength(1)
      expect(normalized.messages[0].content).toEqual({
        type: 'text',
        text: 'Test'
      })
    })

    it('should handle options with no messages or prompt', () => {
      const options: CompletionOptions = {
        messages: [],
        model: 'test-model'
      }

      const normalized = client['normalizeOptions'](options)

      expect(normalized.messages).toEqual([])
    })
  })
})
