import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnthropicClient } from '../AnthropicClient.js'
import { mockFetchSuccess, mockFetchError, createMockAnthropicResponse } from '../../../../../../tests/helpers/mock-llm.js'

describe('AnthropicClient', () => {
  let client: AnthropicClient

  beforeEach(() => {
    client = new AnthropicClient('test-api-key', 'https://api.anthropic.com/v1/messages', '2023-06-01')
  })

  describe('Constructor', () => {
    it('should initialize with API key, base URL and version', () => {
      expect(client).toBeDefined()
      expect(client['apiKey']).toBe('test-api-key')
      expect(client['baseUrl']).toBe('https://api.anthropic.com/v1/messages')
      expect(client['apiVersion']).toBe('2023-06-01')
    })

    it('should use default values if not provided', () => {
      const defaultClient = new AnthropicClient('test-key')
      expect(defaultClient['baseUrl']).toBe('https://api.anthropic.com/v1/messages')
      expect(defaultClient['apiVersion']).toBe('2023-06-01')
    })
  })

  describe('Message Format Conversion', () => {
    it('should convert simple text message to Anthropic format', async () => {
      const mockResponse = createMockAnthropicResponse('Test response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'claude-3-5-sonnet-20241022'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
      ])
    })

    it('should handle system messages separately', async () => {
      const mockResponse = createMockAnthropicResponse('Response with system')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'system',
            content: { type: 'text', text: 'You are a helpful assistant' }
          },
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'claude-3-5-sonnet-20241022'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.system).toEqual([
        {
          type: 'text',
          text: 'You are a helpful assistant',
          cache_control: { type: 'ephemeral' }
        }
      ])
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].role).toBe('user')
    })

    it('should convert image with base64 data to Anthropic format', async () => {
      const mockResponse = createMockAnthropicResponse('Image analyzed')
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
        model: 'claude-3-5-sonnet-20241022'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.messages[0].content).toEqual([
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'abc123'
          }
        }
      ])
    })

    it('should handle tool role as user role', async () => {
      const mockResponse = createMockAnthropicResponse('Tool response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'tool',
            content: { type: 'text', text: 'Tool result' }
          }
        ] as any,
        model: 'claude-3-5-sonnet-20241022'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.messages[0].role).toBe('user')
    })
  })

  describe('JSON Response Format', () => {
    it('should add JSON instruction to system prompt when response_format is json_object', async () => {
      const mockResponse = createMockAnthropicResponse('{"key": "value"}')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Return JSON' }
          }
        ],
        model: 'claude-3-5-sonnet-20241022',
        response_format: { type: 'json_object' }
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.system).toEqual([
        {
          type: 'text',
          text: '请以有效的JSON格式提供响应。',
          cache_control: { type: 'ephemeral' }
        }
      ])
    })

    it('should append JSON instruction to existing system prompt', async () => {
      const mockResponse = createMockAnthropicResponse('{"result": "ok"}')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'system',
            content: { type: 'text', text: 'You are helpful' }
          },
          {
            role: 'user',
            content: { type: 'text', text: 'Return JSON' }
          }
        ],
        model: 'claude-3-5-sonnet-20241022',
        response_format: { type: 'json_object' }
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.system).toEqual([
        {
          type: 'text',
          text: 'You are helpful\n\n请以有效的JSON格式提供响应。',
          cache_control: { type: 'ephemeral' }
        }
      ])
    })
  })

  describe('Non-streaming Response', () => {
    it('should return completion response successfully', async () => {
      const mockResponse = createMockAnthropicResponse('Test completion response')
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test prompt' } }
        ],
        model: 'claude-3-5-sonnet-20241022'
      })

      expect(result.content).toBe('Test completion response')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.finishReason).toBe('end_turn')
    })

    it('should extract text from content blocks', async () => {
      const mockResponse = {
        ...createMockAnthropicResponse(''),
        content: [
          { type: 'text', text: 'First block. ' },
          { type: 'text', text: 'Second block.' }
        ]
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      expect(result.content).toBe('First block. Second block.')
    })

    it('should handle Claude 2 format (completion field)', async () => {
      const mockResponse = {
        completion: 'Claude 2 response',
        model: 'claude-2',
        stop_reason: 'stop'
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      expect(result.content).toBe('Claude 2 response')
    })
  })

  describe('Streaming Response', () => {
    it('should handle streaming response with content_block_delta', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n'))
          controller.enqueue(encoder.encode('data: {"type":"content_block_delta","delta":{"text":" World"}}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream
      })

      const updates: string[] = []
      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'claude-3-5-sonnet-20241022',
        stream: true,
        onUpdate: (content) => updates.push(content)
      })

      expect(result.content).toBe('Hello World')
      expect(updates).toEqual(['Hello', 'Hello World'])
    })

    it('should handle Claude 2 streaming format', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"completion":"Hello World","stop_reason":null}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream
      })

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        stream: true,
        onUpdate: vi.fn()
      })

      expect(result.content).toBe('Hello World')
    })
  })

  describe('Error Handling', () => {
    it('should throw error on API error response', async () => {
      mockFetchError(400, 'Bad request')

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ]
        })
      ).rejects.toThrow('Anthropic补全请求失败')
    })

    it('should handle API error with error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } })
      })

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ]
        })
      ).rejects.toThrow('Invalid API key')
    })
  })

  describe('Request Headers and Parameters', () => {
    it('should include correct headers', async () => {
      const mockResponse = createMockAnthropicResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['x-api-key']).toBe('test-api-key')
      expect(callArgs.headers['anthropic-version']).toBe('2023-06-01')
      expect(callArgs.headers['X-Title']).toBe('MarkPDFdown')
    })

    it('should include temperature and max_tokens', async () => {
      const mockResponse = createMockAnthropicResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.5,
        maxTokens: 1000
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.temperature).toBe(0.5)
      expect(body.max_tokens).toBe(1000)
    })

    it('should override apiKey if provided in options', async () => {
      const mockResponse = createMockAnthropicResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        apiKey: 'override-key'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['x-api-key']).toBe('override-key')
    })
  })
})
