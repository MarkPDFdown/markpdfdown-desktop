import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Protocol consistency between ModelService (endpoint), OllamaClient (request
 * body and response parsing) and the Ollama server.
 *
 * Only the database and reading the page image are mocked. Unit tests that mock either side of
 * the HTTP boundary could not catch issue #72: one side asserted /api/generate,
 * the other returned a /api/chat shaped response.
 */

const mockProviderRepository = { findById: vi.fn() }

vi.mock('../../../domain/repositories/ProviderRepository.js', () => ({
  default: mockProviderRepository
}))

vi.mock('fs', () => ({
  promises: { readFile: vi.fn().mockResolvedValue(Buffer.from('page-image')) }
}))

const HOST = 'http://ollama.test:11434'
const MARKDOWN = '# Page title\n\nBody text'
const PAGE_IMAGE_BASE64 = Buffer.from('page-image').toString('base64')

/**
 * Mirrors the routes of a real Ollama server (server/routes.go):
 * - /api/chat reads `messages`, answers in `message.content`, and streams NDJSON
 *   unless `stream` is false.
 * - /api/generate reads `prompt`, has no `messages` field, answers in `response`,
 *   and for an empty prompt only loads the model (`done_reason: "load"`).
 * - Unknown routes get Gin's plain-text 404.
 */
const fakeOllamaServer = vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
  const { pathname } = new URL(String(input))
  const body = JSON.parse(String(init?.body ?? '{}'))
  const json = (data: unknown) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

  if (pathname === '/api/chat') {
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ model: body.model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'load' })
    }
    const hasImage = body.messages.some((m: { images?: string[] }) => m.images?.length)
    const content = hasImage ? MARKDOWN : 'no image received'
    if (body.stream === false) {
      return json({ model: body.model, message: { role: 'assistant', content }, done: true, done_reason: 'stop' })
    }
    const ndjson = [
      { model: body.model, message: { role: 'assistant', content }, done: false },
      { model: body.model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
    ].map((line) => JSON.stringify(line)).join('\n') + '\n'
    return new Response(ndjson, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  }

  if (pathname === '/api/generate') {
    return json(body.prompt
      ? { model: body.model, response: MARKDOWN, done: true, done_reason: 'stop' }
      : { model: body.model, response: '', done: true, done_reason: 'load' })
  }

  return new Response('404 page not found', {
    status: 404,
    statusText: 'Not Found',
    headers: { 'Content-Type': 'text/plain' }
  })
})

describe('Ollama protocol consistency', () => {
  let modelService: any

  const useProvider = (base_url: string, suffix: string | null, api_key = '') => {
    mockProviderRepository.findById.mockResolvedValue({
      id: 1,
      type: 'ollama',
      api_key,
      base_url,
      suffix
    })
  }

  const requestedPath = () => new URL(String(fakeOllamaServer.mock.calls[0][0])).pathname

  beforeEach(async () => {
    fakeOllamaServer.mockClear()
    global.fetch = fakeOllamaServer as unknown as typeof fetch
    vi.spyOn(console, 'log').mockImplementation(() => {})
    modelService = (await import('../ModelService.js')).default
  })

  // The same request ConverterWorker.convertPage sends for each page
  const convertPage = async () =>
    modelService.completion(1, {
      model: 'llama3.2-vision',
      messages: await modelService.transformImageMessage('/tmp/page.png'),
      stream: false
    })

  describe('page conversion', () => {
    it('returns non-empty Markdown with the default provider configuration (issue #72)', async () => {
      useProvider(`${HOST}/api`, '')

      const result = await convertPage()

      expect(requestedPath()).toBe('/api/chat')
      expect(result.content).toBe(MARKDOWN)
    })

    it('sends the page image and both messages in the shape /api/chat reads', async () => {
      useProvider(`${HOST}/api`, '')

      await convertPage()

      const body = JSON.parse(String(fakeOllamaServer.mock.calls[0][1]?.body))
      expect(body.stream).toBe(false)
      expect(body.prompt).toBeUndefined()
      expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
      expect(body.messages[1].images).toEqual([PAGE_IMAGE_BASE64])
    })

    // Every option offered by the suffix dropdown in Provider.tsx, plus the "unset" value
    it.each([
      { base: `${HOST}/api`, suffix: '' },
      { base: `${HOST}/api`, suffix: null },
      { base: `${HOST}/api`, suffix: '/chat' }
    ])('reaches /api/chat with base "$base" and suffix "$suffix"', async ({ base, suffix }) => {
      useProvider(base, suffix)

      const result = await convertPage()

      expect(requestedPath()).toBe('/api/chat')
      expect(result.content).toBe(MARKDOWN)
    })
  })

  describe('model connection check', () => {
    // completion.handler.ts testConnection and markImagedown do not pass `stream`
    it('parses the response when the caller does not specify stream', async () => {
      useProvider(`${HOST}/api`, '')

      const result = await modelService.completion(1, {
        model: 'llama3.2-vision',
        maxTokens: 8,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${PAGE_IMAGE_BASE64}` } },
            { type: 'text', text: 'Identify the largest letter.' }
          ]
        }]
      })

      expect(result.content).toBe(MARKDOWN)
    })
  })

  describe('reverse proxy with Bearer authentication (issue #89)', () => {
    const API_KEY = 'proxy-key'

    const testConnection = () =>
      modelService.completion(1, {
        model: 'llama3.2-vision',
        maxTokens: 8,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${PAGE_IMAGE_BASE64}` } },
            { type: 'text', text: 'Identify the largest letter.' }
          ]
        }]
      })

    beforeEach(() => {
      global.fetch = vi.fn(async (input: string | URL, init?: RequestInit) =>
        new Headers(init?.headers).get('Authorization') === `Bearer ${API_KEY}`
          ? fakeOllamaServer(input, init)
          : new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
      ) as unknown as typeof fetch
    })

    it.each([
      ['page conversion', convertPage],
      ['connection test', testConnection]
    ])('authenticates the %s', async (_name, request) => {
      useProvider(`${HOST}/api`, '', API_KEY)

      const result = await request()

      expect(result.content).toBe(MARKDOWN)
    })

    it('sends no Authorization header when no key is configured', async () => {
      useProvider(`${HOST}/api`, '')

      await expect(convertPage()).rejects.toThrow(/HTTP 401/)

      const init = vi.mocked(global.fetch).mock.calls[0][1]
      expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    })
  })

  describe('misconfigured endpoints', () => {
    it('reports the endpoint instead of returning empty content for a non-chat response', async () => {
      useProvider(`${HOST}/api`, '/generate')

      await expect(convertPage()).rejects.toThrow(/\/api\/chat/)
    })

    it('shows the real status code for a plain-text 404 from an unknown route', async () => {
      useProvider(HOST, '/chat')

      await expect(convertPage()).rejects.toThrow(/HTTP 404.*404 page not found/)
    })
  })
})
