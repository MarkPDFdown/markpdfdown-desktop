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
      expect(defaultClient['baseUrl']).toBe('http://localhost:11434/api/chat')
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

    describe('responses that are not a chat stream', () => {
      const stubStream = (...lines: unknown[]) => {
        const ndjson = lines.map((line) => JSON.stringify(line)).join('\n')
        global.fetch = vi.fn().mockResolvedValue(new Response(ndjson))
      }

      const completeStream = (onUpdate: (content: string) => void = vi.fn()) => client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        model: 'llama2',
        stream: true,
        onUpdate
      })

      it('should report an error sent as the first line', async () => {
        stubStream({ error: "model 'x' not found" })

        await expect(completeStream()).rejects.toThrow("Ollama补全请求失败: Ollama 返回错误: model 'x' not found")
      })

      it('should report an error sent after partial content instead of returning it', async () => {
        const onUpdate = vi.fn()
        stubStream(
          { model: 'llama2', message: { content: 'Partial' }, done: false },
          { error: 'llama runner process has terminated' }
        )

        await expect(completeStream(onUpdate)).rejects.toThrow('llama runner process has terminated')
        expect(onUpdate).toHaveBeenCalledWith('Partial')
      })

      it('should report a /api/generate stream instead of returning empty content', async () => {
        stubStream(
          { model: 'llama2', response: 'Hello', done: false },
          { model: 'llama2', response: '', done: true }
        )

        await expect(completeStream()).rejects.toThrow(/Ollama补全请求失败.*缺少 message.*\/api\/chat/)
      })

      it('should report a stream that ends without any message', async () => {
        stubStream({ model: 'llama2', done: false })

        await expect(completeStream()).rejects.toThrow(/缺少 message/)
      })

      it('should report an empty stream', async () => {
        stubStream()

        await expect(completeStream()).rejects.toThrow(/缺少 message/)
      })

      it('should accept a chat stream whose message is empty, like the non-streaming branch', async () => {
        stubStream({ model: 'llama2', message: { role: 'assistant', content: '' }, done: true })

        const result = await completeStream()

        expect(result.content).toBe('')
        expect(result.finishReason).toBe('stop')
      })

      it('should still skip lines that are not JSON', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(
          'not json\n{"model":"llama2","message":{"content":"Hello"},"done":false}\n{"model":"llama2","done":true}\n'
        ))

        const result = await completeStream()

        expect(result.content).toBe('Hello')
      })
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

    const completeText = () => client.completion({
      messages: [
        { role: 'user', content: { type: 'text', text: 'Test' } }
      ],
      stream: false
    })

    it('should handle API error with error message', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Model not found' }), {
          status: 500,
          statusText: 'Internal Server Error'
        })
      )

      await expect(completeText()).rejects.toThrow('Model not found')
    })

    it('should show the status code alongside a JSON error message', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "model 'x' not found" }), {
          status: 404,
          statusText: 'Not Found'
        })
      )

      await expect(completeText()).rejects.toThrow(/HTTP 404.*model 'x' not found/)
    })

    it('should show the status code and body for a non-JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('404 page not found', { status: 404, statusText: 'Not Found' })
      )

      await expect(completeText()).rejects.toThrow(/HTTP 404.*404 page not found/)
    })

    it('should show the status code when the error response has no body', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('', { status: 502, statusText: 'Bad Gateway' })
      )

      await expect(completeText()).rejects.toThrow(/HTTP 502.*Bad Gateway/)
    })

    it('should use the JSON body as is when it has no error field', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('{"detail":"blocked by proxy"}', { status: 403, statusText: 'Forbidden' })
      )

      await expect(completeText()).rejects.toThrow(/HTTP 403.*blocked by proxy/)
    })

    it('should report a successful response that is not JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('<html>login</html>', { status: 200, statusText: 'OK' })
      )

      await expect(completeText()).rejects.toThrow(/HTTP 200/)
    })

    it('should report a response without a message instead of returning empty content', async () => {
      mockFetchSuccess({ model: 'llama2', response: '', done: true, done_reason: 'load' })

      await expect(completeText()).rejects.toThrow(/\/api\/chat/)
    })

    it('should report an error in a successful response instead of blaming the endpoint', async () => {
      mockFetchSuccess({ error: 'llama runner process has terminated' })

      await expect(completeText()).rejects.toThrow('Ollama 返回错误: llama runner process has terminated')
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

    it('should not request a stream when there is no onUpdate to consume it', async () => {
      mockFetchSuccess(createMockOllamaResponse('Response'))

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ]
      })

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
      expect(body.stream).toBe(false)
      expect(result.content).toBe('Response')
    })

    it('should request a stream when onUpdate is provided without a stream option', async () => {
      const encoder = new TextEncoder()
      global.fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"model":"llama3","message":{"content":"test"},"done":false}\n'))
          controller.enqueue(encoder.encode('{"model":"llama3","done":true}\n'))
          controller.close()
        }
      })))

      const result = await client.completion({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Test' } }
        ],
        onUpdate: vi.fn()
      })

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
      expect(body.stream).toBe(true)
      expect(result.content).toBe('test')
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
