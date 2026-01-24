import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIResponsesClient } from '../OpenAIResponsesClient.js'
import { mockFetchSuccess, mockFetchError } from '../../../../../../tests/helpers/mock-llm.js'

describe('OpenAIResponsesClient', () => {
  let client: OpenAIResponsesClient

  beforeEach(() => {
    client = new OpenAIResponsesClient('test-api-key', 'https://api.openai.com/v1/responses')
  })

  describe('Constructor', () => {
    it('should initialize with API key and base URL', () => {
      expect(client).toBeDefined()
      expect(client['apiKey']).toBe('test-api-key')
      expect(client['baseUrl']).toBe('https://api.openai.com/v1/responses')
    })

    it('should use default base URL if not provided', () => {
      const defaultClient = new OpenAIResponsesClient('test-key')
      expect(defaultClient['baseUrl']).toBe('https://api.openai.com/v1/responses')
    })
  })

  describe('Message Format Conversion', () => {
    it('should convert messages to Responses API format', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Test response' }]
          }
        ]
      }
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

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.input).toBeDefined()
      expect(Array.isArray(body.input)).toBe(true)
    })

    it('should extract system messages as instructions', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Response with instructions' }]
          }
        ]
      }
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
        model: 'gpt-4o'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.instructions).toBe('You are helpful')
      expect(body.input).toHaveLength(1)
    })

    it('should handle multiple system messages', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Response' }]
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'system',
            content: { type: 'text', text: 'First instruction' }
          },
          {
            role: 'system',
            content: { type: 'text', text: 'Second instruction' }
          },
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'gpt-4o'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.instructions).toContain('First instruction')
      expect(body.instructions).toContain('Second instruction')
    })

    it('should convert image messages correctly', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Image analyzed' }]
          }
        ]
      }
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

      expect(body.input[0].content).toBeDefined()
      expect(Array.isArray(body.input[0].content)).toBe(true)
    })
  })

  describe('Non-streaming Response', () => {
    it('should return completion response successfully', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Test completion response' }]
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test prompt' } }
        ],
        model: 'gpt-4o'
      })

      expect(result.content).toBe('Test completion response')
      expect(result.model).toBe('gpt-4o')
    })

    it('should handle multiple content parts in output', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [
              { type: 'text', text: 'First part. ' },
              { type: 'text', text: 'Second part.' }
            ]
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      expect(result.content).toBe('First part. Second part.')
    })

    it('should handle empty output', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: []
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

  describe('Tool Support', () => {
    it('should send tools in request when provided', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Tool response' }]
          }
        ]
      }
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
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [],
            tool_calls: [
              {
                id: 'call-456',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"Boston"}'
                }
              }
            ]
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

      expect(result.toolCalls).toBeDefined()
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls![0].function.name).toBe('get_weather')
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
      ).rejects.toThrow('OpenAI Responses API补全请求失败')
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

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ]
        })
      ).rejects.toThrow('Network error')
    })
  })

  describe('Request Parameters', () => {
    it('should include temperature and max_tokens', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Response' }]
          }
        ]
      }
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

    it('should include response_format when specified', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: '{"key": "value"}' }]
          }
        ]
      }
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

    it('should include correct headers', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Response' }]
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['Authorization']).toBe('Bearer test-api-key')
      expect(callArgs.headers['X-Title']).toBe('MarkPDFdown')
    })

    it('should override apiKey if provided in options', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Response' }]
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        apiKey: 'override-key'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['Authorization']).toBe('Bearer override-key')
    })
  })

  describe('Backward Compatibility', () => {
    it('should convert old prompt field to messages format', async () => {
      const mockResponse = {
        id: 'resp-123',
        object: 'response',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            content: [{ type: 'text', text: 'Backward compatible response' }]
          }
        ]
      }
      mockFetchSuccess(mockResponse)

      await client.completion({
        prompt: 'Old style prompt',
        messages: [],
        model: 'gpt-4o'
      } as any)

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.input[0].content).toBe('Old style prompt')
    })
  })
})
