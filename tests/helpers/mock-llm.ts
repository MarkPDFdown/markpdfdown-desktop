import { vi } from 'vitest'

export interface MockLLMResponse {
  content: string
  model?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export const createMockOpenAIResponse = (content: string): any => ({
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content
      },
      finish_reason: 'stop'
    }
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150
  }
})

export const createMockAnthropicResponse = (content: string): any => ({
  id: 'msg-123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: content
    }
  ],
  model: 'claude-3-5-sonnet-20241022',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 100,
    output_tokens: 50
  }
})

export const createMockGeminiResponse = (content: string): any => ({
  candidates: [
    {
      content: {
        parts: [
          {
            text: content
          }
        ],
        role: 'model'
      },
      finishReason: 'STOP',
      index: 0
    }
  ],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    totalTokenCount: 150
  }
})

export const createMockOllamaResponse = (content: string): any => ({
  model: 'llama2',
  created_at: new Date().toISOString(),
  message: {
    role: 'assistant',
    content
  },
  done: true
})

export const createMockStreamingChunks = (content: string): string[] => {
  const words = content.split(' ')
  return words.map(word => word + ' ')
}

export const mockFetchSuccess = (response: any) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => response,
    text: async () => JSON.stringify(response)
  })
}

export const mockFetchError = (status: number, message: string) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: message }),
    text: async () => message
  })
}

export const mockFetchNetworkError = () => {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
}

export const mockStreamingResponse = (chunks: string[]) => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`))
      })
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    }
  })

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream
  })
}
