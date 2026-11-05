import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FINISH_REASON_TRUNCATED } from '../../../../domain/llm/ILLMClient.js'
import type { CompletionOptions, CompletionResponse } from '../LLMClient.js'
import { AnthropicClient } from '../AnthropicClient.js'
import { GeminiClient } from '../GeminiClient.js'
import { OllamaClient } from '../OllamaClient.js'
import { OpenAIClient } from '../OpenAIClient.js'
import { OpenAIResponsesClient } from '../OpenAIResponsesClient.js'

const CONTENT = 'partial markdown'

const messages: CompletionOptions['messages'] = [
  { role: 'user', content: { type: 'text', text: 'convert this page' } }
]

const sse = (...events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')

const responsesEvent = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

const responsesBody = (fields: Record<string, unknown>) => ({
  model: 'gpt-4o',
  output: [{ type: 'message', content: [{ type: 'text', text: CONTENT }] }],
  ...fields
})

// The Responses API has no finish reason for a normal end, only status: "completed"
const responsesEnd = (reason: string) => reason === 'stop'
  ? responsesBody({ status: 'completed', incomplete_details: null })
  : responsesBody({ status: 'incomplete', incomplete_details: { reason } })

interface ClientCase {
  name: string
  create: () => { completion(options: CompletionOptions): Promise<CompletionResponse> }
  /** Response body whose finish reason is the provider's own value */
  body: (reason: string) => unknown
  truncatedReason: string
  /** What the client reports for a normal end, which must stay as it is */
  normalReason: string
  /** Streamed response ending with the provider's own value; absent if the client has no streaming */
  stream?: (reason: string) => string
}

const clients: ClientCase[] = [
  {
    name: 'OpenAI',
    create: () => new OpenAIClient('key', 'https://api.test/chat/completions'),
    body: reason => ({
      model: 'gpt-4o',
      choices: [{ message: { role: 'assistant', content: CONTENT }, finish_reason: reason }]
    }),
    truncatedReason: 'length',
    normalReason: 'stop',
    stream: reason => sse(
      { choices: [{ delta: { content: CONTENT }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: reason }] }
    )
  },
  {
    name: 'Anthropic',
    create: () => new AnthropicClient('key', 'https://api.test/messages'),
    body: reason => ({
      model: 'claude',
      content: [{ type: 'text', text: CONTENT }],
      stop_reason: reason
    }),
    truncatedReason: 'max_tokens',
    normalReason: 'end_turn',
    stream: reason => sse(
      { type: 'content_block_delta', delta: { type: 'text_delta', text: CONTENT } },
      { type: 'message_delta', delta: { stop_reason: reason } }
    )
  },
  {
    name: 'Gemini',
    create: () => new GeminiClient('key', 'https://api.test/models'),
    body: reason => ({
      candidates: [{ content: { parts: [{ text: CONTENT }] }, finishReason: reason }]
    }),
    truncatedReason: 'MAX_TOKENS',
    normalReason: 'STOP'
  },
  {
    name: 'Ollama',
    create: () => new OllamaClient('', 'http://localhost:11434/api/chat'),
    body: reason => ({
      model: 'llama3',
      message: { role: 'assistant', content: CONTENT },
      done: true,
      done_reason: reason
    }),
    truncatedReason: 'length',
    normalReason: 'stop',
    stream: reason => [
      { model: 'llama3', message: { role: 'assistant', content: CONTENT }, done: false },
      { model: 'llama3', message: { role: 'assistant', content: '' }, done: true, done_reason: reason }
    ].map(line => JSON.stringify(line)).join('\n') + '\n'
  },
  {
    name: 'OpenAI Responses',
    create: () => new OpenAIResponsesClient('key', 'https://api.test/responses'),
    body: responsesEnd,
    truncatedReason: 'max_output_tokens',
    normalReason: 'stop',
    stream: reason => responsesEvent('response.output_text.delta', { delta: CONTENT }) +
      responsesEvent(reason === 'stop' ? 'response.completed' : 'response.incomplete', { response: responsesEnd(reason) })
  }
]

const stubFetch = (body: string) => {
  global.fetch = vi.fn().mockResolvedValue(new Response(body))
}

describe('finish reason mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe.each(clients)('$name', ({ create, body, truncatedReason, normalReason }) => {
    it('should keep the finish reason of a normal end', async () => {
      stubFetch(JSON.stringify(body(normalReason)))

      const result = await create().completion({ messages })

      expect(result.finishReason).toBe(normalReason)
    })

    it('should report truncation with the shared value, keeping the partial content', async () => {
      stubFetch(JSON.stringify(body(truncatedReason)))

      const result = await create().completion({ messages })

      expect(result.finishReason).toBe(FINISH_REASON_TRUNCATED)
      expect(result.content).toBe(CONTENT)
    })

    it('should resolve rather than throw on truncation, as the connection test relies on it', async () => {
      stubFetch(JSON.stringify(body(truncatedReason)))

      await expect(create().completion({ messages, maxTokens: 8 })).resolves.toBeDefined()
    })
  })

  describe.each(clients.filter(client => client.stream))('$name streaming', ({ create, stream, truncatedReason, normalReason }) => {
    const completeStream = () => create().completion({ messages, stream: true, onUpdate: vi.fn() })

    it('should report truncation with the shared value', async () => {
      stubFetch(stream!(truncatedReason))

      const result = await completeStream()

      expect(result.finishReason).toBe(FINISH_REASON_TRUNCATED)
      expect(result.content).toBe(CONTENT)
    })

    it('should keep the finish reason of a normal end', async () => {
      stubFetch(stream!(normalReason))

      const result = await completeStream()

      expect(result.finishReason).toBe(normalReason)
    })
  })

  describe('Ollama without done_reason', () => {
    it('should treat a finished response as stopped, as older servers omit the reason', async () => {
      stubFetch(JSON.stringify({ model: 'llama3', message: { role: 'assistant', content: CONTENT }, done: true }))

      const result = await new OllamaClient('', 'http://localhost:11434/api/chat').completion({ messages })

      expect(result.finishReason).toBe('stop')
    })
  })

  describe('OpenAI Responses end states', () => {
    const client = () => new OpenAIResponsesClient('key', 'https://api.test/responses')

    it('should map a gateway that reports the reason on the output item', async () => {
      stubFetch(JSON.stringify({
        model: 'gpt-4o',
        output: [{ content: CONTENT, finish_reason: 'length' }]
      }))

      const result = await client().completion({ messages })

      expect(result.finishReason).toBe(FINISH_REASON_TRUNCATED)
    })

    it('should not report truncation when a response is incomplete for another reason', async () => {
      stubFetch(JSON.stringify(responsesEnd('content_filter')))

      const result = await client().completion({ messages })

      expect(result.finishReason).toBe('content_filter')
    })
  })

  describe('gateways using the value of another protocol', () => {
    it.each(['length', 'max_tokens', 'MAX_TOKENS', 'max_output_tokens'])(
      'should map %s from an OpenAI-compatible gateway',
      async reason => {
        stubFetch(JSON.stringify({
          model: 'gpt-4o',
          choices: [{ message: { role: 'assistant', content: CONTENT }, finish_reason: reason }]
        }))

        const result = await new OpenAIClient('key', 'https://api.test/chat/completions').completion({ messages })

        expect(result.finishReason).toBe(FINISH_REASON_TRUNCATED)
      }
    )
  })

  describe('reasons unrelated to the output limit', () => {
    it.each(['tool_calls', 'content_filter'])('should pass %s through', async reason => {
      stubFetch(JSON.stringify({
        model: 'gpt-4o',
        choices: [{ message: { role: 'assistant', content: CONTENT }, finish_reason: reason }]
      }))

      const result = await new OpenAIClient('key', 'https://api.test/chat/completions').completion({ messages })

      expect(result.finishReason).toBe(reason)
    })
  })
})
