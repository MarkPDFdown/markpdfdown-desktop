import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeminiClient } from '../GeminiClient.js'
import { mockFetchSuccess, mockFetchError, createMockGeminiResponse } from '../../../../../tests/helpers/mock-llm.js'

describe('GeminiClient', () => {
  let client: GeminiClient

  beforeEach(() => {
    client = new GeminiClient('test-api-key', 'https://generativelanguage.googleapis.com/v1beta/models')
  })

  describe('Constructor', () => {
    it('should initialize with API key and base URL', () => {
      expect(client).toBeDefined()
      expect(client['apiKey']).toBe('test-api-key')
      expect(client['baseUrl']).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    })

    it('should use default base URL if not provided', () => {
      const defaultClient = new GeminiClient('test-key')
      expect(defaultClient['baseUrl']).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    })
  })

  describe('Message Format Conversion', () => {
    it('should convert simple text message to Gemini format', async () => {
      const mockResponse = createMockGeminiResponse('Test response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' }
          }
        ],
        model: 'gemini-2.0-flash-exp'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.contents).toBeDefined()
      expect(body.contents[0].role).toBe('user')
      expect(body.contents[0].parts[0].text).toBe('Hello')
    })

    it('should handle system messages', async () => {
      const mockResponse = createMockGeminiResponse('Response with system')
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
        model: 'gemini-2.0-flash-exp'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      // Gemini skips system messages (they are not directly supported)
      expect(body.contents).toHaveLength(1)
      expect(body.contents[0].role).toBe('user')
    })

    it('should convert image with base64 data to Gemini format', async () => {
      const mockResponse = createMockGeminiResponse('Image analyzed')
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
        model: 'gemini-2.0-flash-exp'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.contents[0].parts).toHaveLength(2)
      expect(body.contents[0].parts[0].text).toBe('What is in this image?')
      expect(body.contents[0].parts[1].inline_data).toBeDefined()
    })
  })

  describe('Non-streaming Response', () => {
    it('should return completion response successfully', async () => {
      const mockResponse = createMockGeminiResponse('Test completion response')
      mockFetchSuccess(mockResponse)

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test prompt' } }
        ],
        model: 'gemini-2.0-flash-exp'
      })

      expect(result.content).toBe('Test completion response')
      expect(result.model).toBe('gemini-2.0-flash-exp')
      expect(result.finishReason).toBe('STOP')
    })

    it('should extract text from multiple parts', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'First part. ' },
                { text: 'Second part.' }
              ],
              role: 'model'
            },
            finishReason: 'STOP'
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

    it('should handle empty candidates', async () => {
      const mockResponse = {
        candidates: []
      }
      mockFetchSuccess(mockResponse)

      await expect(
        client.completion({
          messages: [
            { role: 'user', content: { type: 'text', text: 'Test' } }
          ]
        })
      ).rejects.toThrow('Gemini API返回格式错误')
    })
  })

  describe('JSON Response Format', () => {
    it('should set response_mime_type for json_object format', async () => {
      const mockResponse = createMockGeminiResponse('{"key": "value"}')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Return JSON' } }
        ],
        model: 'gemini-2.0-flash-exp',
        response_format: { type: 'json_object' }
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)

      expect(body.generationConfig.response_mime_type).toBe('application/json')
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
      ).rejects.toThrow('Gemini补全请求失败')
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

  describe('Request Headers and Parameters', () => {
    it('should include correct headers', async () => {
      const mockResponse = createMockGeminiResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['x-goog-api-key']).toBe('test-api-key')
      expect(callArgs.headers['X-Title']).toBe('MarkPDFdown')
    })

    it('should include temperature and maxOutputTokens', async () => {
      const mockResponse = createMockGeminiResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gemini-2.0-flash-exp',
        temperature: 0.5,
        maxTokens: 1000
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.generationConfig.temperature).toBe(0.5)
      expect(body.generationConfig.maxOutputTokens).toBe(1000)
    })

    it('should use default model if not provided', async () => {
      const mockResponse = createMockGeminiResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      const url = (global.fetch as any).mock.calls[0][0]
      expect(url).toContain('gemini-1.5-pro')
    })

    it('should override apiKey if provided in options', async () => {
      const mockResponse = createMockGeminiResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        apiKey: 'override-key'
      })

      const callArgs = (global.fetch as any).mock.calls[0][1]
      expect(callArgs.headers['x-goog-api-key']).toBe('override-key')
    })

    it('should construct correct endpoint URL', async () => {
      const mockResponse = createMockGeminiResponse('Response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'gemini-2.0-flash-exp'
      })

      const url = (global.fetch as any).mock.calls[0][0]
      expect(url).toContain('/gemini-2.0-flash-exp:generateContent')
    })
  })

  describe('Backward Compatibility', () => {
    it('should convert old prompt field to messages format', async () => {
      const mockResponse = createMockGeminiResponse('Backward compatible response')
      mockFetchSuccess(mockResponse)

      await client.completion({
        prompt: 'Old style prompt',
        messages: [],
        model: 'gemini-2.0-flash-exp'
      } as any)

      const callArgs = (global.fetch as any).mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.contents[0].parts[0].text).toBe('Old style prompt')
    })
  })
})
