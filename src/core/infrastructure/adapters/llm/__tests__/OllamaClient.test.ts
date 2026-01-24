import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OllamaClient } from '../OllamaClient.js'
import { mockFetchSuccess, mockFetchError, createMockOllamaResponse } from '../../../../../../tests/helpers/mock-llm.js'

describe('OllamaClient', () => {
  let client: OllamaClient

  beforeEach(() => {
    client = new OllamaClient('', 'http://localhost:11434/api')
  })

  describe('Constructor', () => {
    it('should initialize with API key and base URL', () => {
      expect(client).toBeDefined()
      expect(client['apiKey']).toBe('')
      expect(client['baseUrl']).toBe('http://localhost:11434/api')
    })

    it('should use default base URL if not provided', () => {
      const defaultClient = new OllamaClient('')
      expect(defaultClient['baseUrl']).toBe('http://localhost:11434/api')
    })
  })

  describe('Message Format Conversion', () => {
    it('should convert simple text message to Ollama format', async () => {
      const mockResponse = createMockOllamaResponse('Test response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'llama2',
        stream: false
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.messages).toBeDefined()
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toBe('Hello')
    })

    it('should handle system messages', async () => {
      const mockResponse = createMockOllamaResponse('Response with system')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'system',
            content: { type: 'text', text: 'You are helpful' }
          },
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'llama2',
        stream: false
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].role).toBe('system')
    })

    it('should convert image with base64 data to Ollama format', async () => {
      const mockResponse = createMockOllamaResponse('Image analyzed')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,abc123' }
              }
            ]
          }
        ],
        model: 'llava',
        stream: false
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.messages[0].content).toContain('What is in this image?')
      expect(body.messages[0].images).toBeDefined()
      expect(body.messages[0].images[0]).toBe('abc123')
    })
  })

  describe('Non-streaming Response', () => {
    it('should return completion response successfully', async () => {
      const mockResponse = createMockOllamaResponse('Test completion response')
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test prompt' } }
        ],
        model: 'llama2',
        stream: false
      })

      expect(result.content).toBe('Test completion response')
      expect(result.model).toBe('llama2')
      expect(result.finishReason).toBeDefined()
    })

    it('should handle response without message field', async () => {
      const mockResponse = {
        model: 'llama2',
        created_at: new Date().toISOString(),
        message: { role: 'assistant', content: 'Response via message field' },
        done: true
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        stream: false
      })

      expect(result.content).toBe('Response via message field')
    })
  })

  describe('Streaming Response', () => {
    it('should handle streaming response with onUpdate callback', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"model":"llama2","message":{"content":"Hello"},"done":false}\n'))
          controller.enqueue(encoder.encode('{"model":"llama2","message":{"content":" World"},"done":false}\n'))
          controller.enqueue(encoder.encode('{"model":"llama2","message":{"content":""},"done":true}\n'))
          controller.close()
        }
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
        json: vi.fn()
      })

      const updates: string[] = []
      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'llama2',
        stream: true,
        onUpdate: (content) => updates.push(content)
      })

      expect(result.content).toBe('Hello World')
      expect(updates.length).toBeGreaterThan(0)
    })

    it('should handle streaming with message field', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"model":"llama2","message":{"content":"Streaming"},"done":false}\n'))
          controller.enqueue(encoder.encode('{"model":"llama2","message":{"content":" response"},"done":false}\n'))
          controller.enqueue(encoder.encode('{"model":"llama2","done":true}\n'))
          controller.close()
        }
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
        json: vi.fn()
      })

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        stream: true,
        onUpdate: vi.fn()
      })

      expect(result.content).toBe('Streaming response')
    })
  })

  describe('Tool Support', () => {
    it('should send tools in request when provided', async () => {
      const mockResponse = createMockOllamaResponse('Tool response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'What is the weather?' } }
        ],
        model: 'llama2',
        stream: false,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather information',
              parameters: { type: 'object', properties: {} }
            }
          }
        ]
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.tools).toBeDefined()
      expect(body.tools[0].function.name).toBe('get_weather')
    })
  })

  describe('JSON Response Format', () => {
    it('should set format to json for json_object response', async () => {
      const mockResponse = createMockOllamaResponse('{"key": "value"}')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Return JSON' } }
        ],
        model: 'llama2',
        stream: false,
        response_format: { type: 'json_object' }
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.format).toBe('json')
    })
  })

  describe('Error Handling', () => {
    it('should throw error on API error response', async () => {
      mockFetchError(400, 'Bad request')

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ],
          stream: false
        })
      ).rejects.toThrow('Ollama补全请求失败')
    })

    it('should handle API error with error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Model not found' })
      })

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ],
          stream: false
        })
      ).rejects.toThrow('Model not found')
    })

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ],
          stream: false
        })
      ).rejects.toThrow('Connection refused')
    })
  })

  describe('Request Parameters', () => {
    it('should include temperature in options', async () => {
      const mockResponse = createMockOllamaResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'llama2',
        stream: false,
        temperature: 0.5
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.options.temperature).toBe(0.5)
    })

    it('should include num_predict (maxTokens) in options', async () => {
      const mockResponse = createMockOllamaResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'llama2',
        stream: false,
        maxTokens: 1000
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.options.num_predict).toBe(1000)
    })

    it('should use default model if not provided', async () => {
      const mockResponse = createMockOllamaResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        stream: false
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.model).toBe('llama3')
    })

    it('should default stream to true when onUpdate is provided', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"model":"llama3","message":{"content":"test"},"done":false}\n'))
          controller.enqueue(encoder.encode('{"model":"llama3","done":true}\n'))
          controller.close()
        }
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
        json: async () => ({ model: 'llama3', message: { content: 'test' }, done: true })
      })

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        stream: true,
        onUpdate: vi.fn()
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.stream).toBe(true)
      expect(result.content).toBe('test')
    })
  })

  describe('Backward Compatibility', () => {
    it('should convert old prompt field to messages format', async () => {
      const mockResponse = createMockOllamaResponse('Backward compatible response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        prompt: 'Old style prompt',
        messages: [],
        model: 'llama2',
        stream: false
      } as any)

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages[0].content).toBe('Old style prompt')
    })
  })
})
