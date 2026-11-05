import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NO_SUFFIX } from '../../../../shared/providerSuffix.js'

/**
 * The URL each provider type really requests, for each stored suffix.
 *
 * Only the database and fetch are mocked: ModelService builds the URL and
 * the real clients may extend it, so testing either side alone cannot catch a
 * suffix that does not reach the wire (issue #89).
 */

const mockProviderRepository = { findById: vi.fn() }

vi.mock('../../../domain/repositories/ProviderRepository.js', () => ({
  default: mockProviderRepository
}))

const BASE = 'https://proxy.test/v1/my-endpoint'
const MODEL = 'some-model'

// A body every client can parse, each reads only the fields of its own protocol
const ANY_PROTOCOL_BODY = {
  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  output: [{ content: 'ok' }],
  content: [{ type: 'text', text: 'ok' }],
  candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }]
}

const CASES = [
  { type: 'openai', defaultUrl: `${BASE}/chat/completions` },
  { type: 'openai-responses', defaultUrl: `${BASE}/responses` },
  { type: 'anthropic', defaultUrl: `${BASE}/messages` },
  { type: 'gemini', defaultUrl: `${BASE}/models/${MODEL}:generateContent` }
]

describe('Provider request URL', () => {
  let modelService: any
  const fetchMock = vi.fn()

  const requestedUrl = async (type: string, suffix: string | null, base_url = BASE) => {
    mockProviderRepository.findById.mockResolvedValue({ id: 1, type, api_key: 'key', base_url, suffix })
    const result = await modelService.completion(1, {
      model: MODEL,
      messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }]
    })
    expect(result.content).toBe('ok')
    return String(fetchMock.mock.calls[0][0])
  }

  beforeEach(async () => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(ANY_PROTOCOL_BODY), { status: 200 }))
    global.fetch = fetchMock as unknown as typeof fetch
    vi.spyOn(console, 'log').mockImplementation(() => {})
    modelService = (await import('../ModelService.js')).default
  })

  describe.each(CASES)('$type', ({ type, defaultUrl }) => {
    it('requests exactly the base URL when "no suffix" is selected', async () => {
      expect(await requestedUrl(type, NO_SUFFIX)).toBe(BASE)
    })

    it.each([[''], [null]])('keeps the default URL of an existing provider with suffix %j', async (suffix) => {
      expect(await requestedUrl(type, suffix)).toBe(defaultUrl)
    })

    it('rejects "no suffix" without a base URL instead of calling the official endpoint', async () => {
      mockProviderRepository.findById.mockResolvedValue({ id: 1, type, api_key: 'key', base_url: '', suffix: NO_SUFFIX })

      await expect(modelService.completion(1, { model: MODEL, messages: [] })).rejects.toThrow('无后缀')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it('still adds the model path to a custom Gemini suffix', async () => {
    expect(await requestedUrl('gemini', '/custom')).toBe(`${BASE}/custom/${MODEL}:generateContent`)
  })
})
