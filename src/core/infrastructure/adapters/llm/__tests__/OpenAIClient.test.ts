import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIClient } from '../OpenAIClient.js'
import { mockFetchSuccess, mockFetchError, mockFetchNetworkError, createMockOpenAIResponse } from '../../../../../../tests/helpers/mock-llm.js'

describe('OpenAIClient', () => {
  let client: OpenAIClient

  beforeEach(() => {
    client = new OpenAIClient('test-api-key', 'https://api.openai.com/v1/chat/completions')
  })

  describe('Constructor', () => {
    it('should initialize with API key and custom base URL', () => {
      expect(client).toBeDefined()
      expect(client['apiKey']).toBe('test-api-key')
      expect(client['baseUrl']).toBe('https://api.openai.com/v1/chat/completions')
    })

    it('should use default base URL if not provided', () => {
      const defaultClient = new OpenAIClient('test-key')
      expect(defaultClient['baseUrl']).toBe('https://api.openai.com/v1/chat/completions')
    })
  })

  describe('Message Format Conversion', () => {
    it('should convert simple text message to OpenAI format', async () => {
      const mockResponse = createMockOpenAIResponse('Test response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'gpt-4o'
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"messages"')
        })
      )

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages).toEqual([
        { role: 'user', content: 'Hello' }
      ])
    })

    it('should convert image_url message to OpenAI format', async () => {
      const mockResponse = createMockOpenAIResponse('Image analyzed')
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
        model: 'gpt-4o'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages[0].content).toEqual([
        { type: 'text', text: 'What is in this image?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } }
      ])
    })

    it('should handle multi-part content with text and images', async () => {
      const mockResponse = createMockOpenAIResponse('Multi-part response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Compare these images' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,img1' } },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,img2' } }
            ]
          }
        ],
        model: 'gpt-4o'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages[0].content).toHaveLength(3)
    })
  })

  describe('Backward Compatibility', () => {
    it('should convert old prompt field to messages format', async () => {
      const mockResponse = createMockOpenAIResponse('Backward compatible response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        prompt: 'Old style prompt',
        messages: [],
        model: 'gpt-4o'
      } as any)

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages).toEqual([
        { role: 'user', content: 'Old style prompt' }
      ])
    })

    it('should prioritize messages over prompt field', async () => {
      const mockResponse = createMockOpenAIResponse('Messages take priority')
      mockFetchSuccess(mockResponse)

      await client.completion({
        prompt: 'Old prompt',
        messages: [
          { role: 'user', content: { type: 'text', text: 'New message' } }
        ],
        model: 'gpt-4o'
      } as any)

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.messages).toEqual([
        { role: 'user', content: 'New message' }
      ])
    })
  })

  describe('Non-streaming Response', () => {
    it('should return completion response successfully', async () => {
      const mockResponse = createMockOpenAIResponse('Test completion response')
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test prompt' } }
        ],
        model: 'gpt-4o'
      })

      expect(result).toEqual({
        content: 'Test completion response',
        model: 'gpt-4o',
        finishReason: 'stop',
        toolCalls: undefined,
        responseFormat: undefined,
        rawResponse: mockResponse
      })
    })

    it('should include model and finish reason in response', async () => {
      const mockResponse = createMockOpenAIResponse('Response with metadata')
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gpt-4o-mini'
      })

      expect(result.model).toBe('gpt-4o')
      expect(result.finishReason).toBe('stop')
    })

    it('should handle empty content response', async () => {
      const mockResponse = {
        ...createMockOpenAIResponse(''),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '' },
            finish_reason: 'stop'
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      expect(result.content).toBe('')
    })
  })

  describe('Streaming Response', () => {
    it('should handle streaming response with onUpdate callback', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n'))
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
        model: 'gpt-4o',
        stream: true,
        onUpdate: (content) => updates.push(content)
      })

      expect(result.content).toBe('Hello World')
      expect(updates).toEqual(['Hello', 'Hello World'])
    })

    it('should handle tool calls in streaming response', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          // First chunk with tool_call id and type
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"id":"call-123","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n'))
          // Second chunk with arguments - must include id to match existing tool call
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"id":"call-123","function":{"arguments":"{\\"location\\":\\"Boston\\"}"}}]}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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
          { role: 'user', content: { type: 'text', text: 'Weather in Boston?' } }
        ],
        model: 'gpt-4o',
        stream: true,
        onUpdate: vi.fn()
      })

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls![0]).toEqual({
        id: 'call-123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location":"Boston"}'
        }
      })
    })
  })

  describe('Tool Call Support', () => {
    it('should send tools in request when provided', async () => {
      const mockResponse = createMockOpenAIResponse('Tool response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'What is the weather?' } }
        ],
        model: 'gpt-4o',
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

    it('should parse tool calls from response', async () => {
      const mockResponse = {
        ...createMockOpenAIResponse(''),
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-456',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"San Francisco"}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Weather?' } }
        ],
        model: 'gpt-4o'
      })

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls![0].function.name).toBe('get_weather')
      expect(result.toolCalls![0].function.arguments).toBe('{"location":"San Francisco"}')
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
      ).rejects.toThrow('OpenAI补全请求失败')
    })

    it('should throw error on network failure', async () => {
      mockFetchNetworkError()

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ]
        })
      ).rejects.toThrow('Network error')
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

  describe('Request Parameters', () => {
    it('should include temperature and max_tokens in request', async () => {
      const mockResponse = createMockOpenAIResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 1000
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.temperature).toBe(0.5)
      expect(body.max_tokens).toBe(1000)
    })

    it('should use default temperature if not provided', async () => {
      const mockResponse = createMockOpenAIResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gpt-4o'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.temperature).toBe(0.7)
    })

    it('should not include max_tokens when not provided', async () => {
      const mockResponse = createMockOpenAIResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gpt-4o'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.max_tokens).toBeUndefined()
    })

    it('should include response_format when specified', async () => {
      const mockResponse = createMockOpenAIResponse('{"key": "value"}')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Return JSON' } }
        ],
        model: 'gpt-4o',
        response_format: { type: 'json_object' }
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.response_format).toEqual({ type: 'json_object' })
    })

    it('should override apiKey if provided in options', async () => {
      const mockResponse = createMockOpenAIResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gpt-4o',
        apiKey: 'override-key'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['Authorization']).toBe('Bearer override-key')
    })

    it('should include custom headers', async () => {
      const mockResponse = createMockOpenAIResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['X-Title']).toBe('MarkPDFdown')
      expect(callArgs.headers['HTTP-Referer']).toBe('https://github.com/MarkPDFdown')
    })
  })
})
