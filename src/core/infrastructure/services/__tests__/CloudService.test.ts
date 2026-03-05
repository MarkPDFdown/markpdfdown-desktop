import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthManager = {
  getAccessToken: vi.fn(),
  fetchWithAuth: vi.fn(),
}

const mockReadFile = vi.fn()

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
  },
}))

vi.mock('../AuthManager.js', () => ({
  authManager: mockAuthManager,
}))

const makeJsonResponse = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
  headers: {
    get: vi.fn(),
  },
  arrayBuffer: vi.fn(),
})

const makeJsonRejectResponse = (status: number, message: string) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockRejectedValue(new Error(message)),
  headers: {
    get: vi.fn(),
  },
  arrayBuffer: vi.fn(),
})

describe('CloudService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthManager.getAccessToken.mockResolvedValue('token-1')
  })

  it('convert returns auth error when token is missing', async () => {
    mockAuthManager.getAccessToken.mockResolvedValueOnce('')
    const cloudService = (await import('../CloudService.js')).default

    const result = await cloudService.convert({ name: 'a.pdf', content: new ArrayBuffer(8) })

    expect(result).toEqual({ success: false, error: 'Authentication required' })
    expect(mockAuthManager.fetchWithAuth).not.toHaveBeenCalled()
  })

  it('convert supports file content upload path', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(200, { success: true, data: { task_id: 'task-1' } }),
    )

    const result = await cloudService.convert({
      name: 'demo.pdf',
      content: new TextEncoder().encode('abc').buffer,
      model: 'pro',
      page_range: '1-3',
    })

    expect(result.success).toBe(true)
    const [url, options] = mockAuthManager.fetchWithAuth.mock.calls[0]
    expect(url).toContain('/api/v1/convert')
    expect(options.method).toBe('POST')
  })

  it('convert supports file path upload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockReadFile.mockResolvedValueOnce(Buffer.from('file-content'))
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(200, { success: true, data: { task_id: 'task-path' } }),
    )

    const result = await cloudService.convert({ name: 'path.pdf', path: '/tmp/path.pdf' })

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/path.pdf')
    expect(result.success).toBe(true)
  })

  it('convert validates missing content and path', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const result = await cloudService.convert({ name: 'bad.pdf' })
    expect(result).toEqual({ success: false, error: 'No file content or path provided' })
  })

  it('convert returns server message when request fails', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(400, { error: { message: 'bad request' } }),
    )

    const result = await cloudService.convert({ name: 'demo.pdf', content: new ArrayBuffer(8) })

    expect(result).toEqual({ success: false, error: 'bad request' })
  })

  it('convert handles invalid success payload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(200, { success: false, data: null }),
    )

    const result = await cloudService.convert({ name: 'demo.pdf', content: new ArrayBuffer(8) })

    expect(result).toEqual({ success: false, error: 'Invalid response from server' })
  })

  it('getTasks returns data and pagination', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const response = {
      success: true,
      data: [{ id: 't1' }],
      pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
    }
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, response))

    const result = await cloudService.getTasks(1, 10)

    expect(result).toEqual({ success: true, data: response.data, pagination: response.pagination })
  })

  it('getTasks returns invalid response error when success=false', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, { success: false, error: { message: 'bad tasks' } }))

    const result = await cloudService.getTasks(2, 5)
    expect(result).toEqual({ success: false, error: 'bad tasks' })
  })

  it('getTaskById handles non-OK response', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(404, { error: { message: 'not found' } }))

    const result = await cloudService.getTaskById('missing')
    expect(result).toEqual({ success: false, error: 'not found' })
  })

  it('getTaskById/getTaskPages succeed with valid payloads', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: { id: 'task-1' } }))
      .mockResolvedValueOnce(makeJsonResponse(200, {
        success: true,
        data: [{ page: 1, status: 2 }],
        pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
      }))

    const taskResult = await cloudService.getTaskById('task-1')
    const pageResult = await cloudService.getTaskPages('task-1', 1, 20)

    expect(taskResult).toEqual({ success: true, data: { id: 'task-1' } })
    expect(pageResult.success).toBe(true)
    expect(pageResult.data).toHaveLength(1)
    expect(pageResult.pagination?.page_size).toBe(20)
  })

  it('getTaskPages returns API message when non-OK', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(403, { error: { message: 'forbidden' } }))

    const result = await cloudService.getTaskPages('task-1', 1, 20)
    expect(result).toEqual({ success: false, error: 'forbidden' })
  })

  it('getTaskPages handles invalid payload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, { success: false }))

    const result = await cloudService.getTaskPages('task-1', 1, 20)
    expect(result).toEqual({ success: false, error: 'Invalid pages response' })
  })

  it('cancelTask/retryTask/retryPage/deleteTask succeed when payload is valid', async () => {
    const cloudService = (await import('../CloudService.js')).default

    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: { id: 'task-1', message: 'cancelled' } }))
      .mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: { task_id: 'task-2', events_url: '/events' } }))
      .mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: { task_id: 'task-1', page: 3, status: 'queued' } }))
      .mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: { id: 'task-1', message: 'deleted' } }))

    await expect(cloudService.cancelTask('task-1')).resolves.toEqual({
      success: true,
      data: { id: 'task-1', message: 'cancelled' },
    })
    await expect(cloudService.retryTask('task-1')).resolves.toEqual({
      success: true,
      data: { task_id: 'task-2', events_url: '/events' },
    })
    await expect(cloudService.retryPage('task-1', 3)).resolves.toEqual({
      success: true,
      data: { task_id: 'task-1', page: 3, status: 'queued' },
    })
    await expect(cloudService.deleteTask('task-1')).resolves.toEqual({
      success: true,
      data: { id: 'task-1', message: 'deleted' },
    })
  })

  it('cancelTask/retryTask/retryPage/deleteTask return API errors when non-OK', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonResponse(409, { error: { message: 'cannot cancel' } }))
      .mockResolvedValueOnce(makeJsonResponse(409, { error: { message: 'cannot retry' } }))
      .mockResolvedValueOnce(makeJsonResponse(409, { error: { message: 'cannot retry page' } }))
      .mockResolvedValueOnce(makeJsonResponse(409, { error: { message: 'cannot delete' } }))

    await expect(cloudService.cancelTask('task-1')).resolves.toEqual({ success: false, error: 'cannot cancel' })
    await expect(cloudService.retryTask('task-1')).resolves.toEqual({ success: false, error: 'cannot retry' })
    await expect(cloudService.retryPage('task-1', 1)).resolves.toEqual({ success: false, error: 'cannot retry page' })
    await expect(cloudService.deleteTask('task-1')).resolves.toEqual({ success: false, error: 'cannot delete' })
  })

  it('cancelTask/retryTask/retryPage/deleteTask return validation errors for invalid response', async () => {
    const cloudService = (await import('../CloudService.js')).default

    mockAuthManager.fetchWithAuth.mockResolvedValue(makeJsonResponse(200, { success: true, data: null }))

    await expect(cloudService.cancelTask('task-1')).resolves.toEqual({ success: false, error: 'Invalid cancel response' })
    await expect(cloudService.retryTask('task-1')).resolves.toEqual({ success: false, error: 'Invalid retry response' })
    await expect(cloudService.retryPage('task-1', 1)).resolves.toEqual({ success: false, error: 'Invalid page retry response' })
    await expect(cloudService.deleteTask('task-1')).resolves.toEqual({ success: false, error: 'Invalid delete response' })
  })

  it('getTaskResult returns invalid response error', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: null }))

    const result = await cloudService.getTaskResult('task-1')
    expect(result).toEqual({ success: false, error: 'Invalid result response' })

    const call = mockAuthManager.fetchWithAuth.mock.calls[0]
    expect(call[2]).toEqual({ timeoutMs: 0 })
  })

  it('getTaskResult succeeds with valid payload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, {
      success: true,
      data: {
        markdown: '# done',
        pages: [],
        metadata: { model_tier: 'lite', file_type: 'pdf', page_count: 1 },
        credits: { consumed: 1 },
      },
    }))

    const result = await cloudService.getTaskResult('task-1')
    expect(result.success).toBe(true)
    expect(result.data?.markdown).toBe('# done')
  })

  it('downloadPdf sanitizes file name and returns buffer', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const response = makeJsonResponse(200, {})
    response.headers.get.mockReturnValue('attachment; filename="../bad:name?.pdf"')
    response.arrayBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(response)

    const result = await cloudService.downloadPdf('task-1')

    expect(result.success).toBe(true)
    expect(result.data?.fileName).toBe('bad_name_.pdf')
    expect(result.data?.buffer.byteLength).toBe(3)
  })

  it('downloadPdf uses fallback file name when header is missing', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const response = makeJsonResponse(200, {})
    response.headers.get.mockReturnValue('')
    response.arrayBuffer.mockResolvedValue(new Uint8Array([1]).buffer)
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(response)

    const result = await cloudService.downloadPdf('task-xyz')
    expect(result.data?.fileName).toBe('task-task-xyz.pdf')
  })

  it('downloadPdf decodes RFC5987 filename* for non-english names', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const response = makeJsonResponse(200, {})
    response.headers.get.mockReturnValue(
      "attachment; filename*=UTF-8''%E4%B8%AD%E6%96%87%E6%8A%80%E6%9C%AF%E6%89%8B%E5%86%8C.pdf",
    )
    response.arrayBuffer.mockResolvedValue(new Uint8Array([1]).buffer)
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(response)

    const result = await cloudService.downloadPdf('task-cn')
    expect(result.data?.fileName).toBe('中文技术手册.pdf')
  })

  it('downloadPdf repairs common UTF-8 mojibake in filename', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const response = makeJsonResponse(200, {})
    const original = '中文手册2.0.pdf'
    const mojibake = Buffer.from(original, 'utf8').toString('latin1')
    response.headers.get.mockReturnValue(`attachment; filename="${mojibake}"`)
    response.arrayBuffer.mockResolvedValue(new Uint8Array([1]).buffer)
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(response)

    const result = await cloudService.downloadPdf('task-mojibake')
    expect(result.data?.fileName).toBe(original)
  })

  it('downloadPdf/getPageImage return error on non-OK response', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonResponse(401, { error: { message: 'unauthorized' } }))
      .mockResolvedValueOnce(makeJsonResponse(404, {}))

    const pdfResult = await cloudService.downloadPdf('task-1')
    const imageResult = await cloudService.getPageImage('task-1', 1)

    expect(pdfResult).toEqual({ success: false, error: 'unauthorized' })
    expect(imageResult).toEqual({ success: false, error: 'Failed to fetch page image: 404' })
  })

  it('getPageImage converts binary to data URL', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const response = makeJsonResponse(200, {})
    response.headers.get.mockReturnValue('image/jpeg')
    response.arrayBuffer.mockResolvedValue(new Uint8Array([255, 216, 255]).buffer)
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(response)

    const result = await cloudService.getPageImage('task-1', 2)

    expect(result.success).toBe(true)
    expect(result.data?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('createCheckout validates amount before request', async () => {
    const cloudService = (await import('../CloudService.js')).default
    const result = await cloudService.createCheckout(0)
    expect(result).toEqual({ success: false, error: 'Invalid top-up amount' })
  })

  it('createCheckout includes allowed amounts in error message', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(400, {
        success: false,
        error: {
          message: 'Invalid amount',
          details: { allowed_amounts_usd: [10, 20] },
        },
      }),
    )

    const result = await cloudService.createCheckout(11)
    expect(result).toEqual({ success: false, error: 'Invalid amount (allowed: 10, 20)' })
  })

  it('createCheckout succeeds and validates payload shape', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, {
      success: true,
      data: {
        checkout_url: 'https://checkout.example/session',
        session_id: 's-1',
        amount_usd: 10,
        credits_to_add: 1000,
      },
    }))

    const result = await cloudService.createCheckout(10)
    expect(result.success).toBe(true)
    expect(result.data?.session_id).toBe('s-1')
  })

  it('createCheckout rejects malformed success payload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, {
      success: true,
      data: {
        session_id: 's-1',
      },
    }))

    const result = await cloudService.createCheckout(10)
    expect(result).toEqual({ success: false, error: 'Invalid checkout response' })
  })

  it('getCheckoutStatus validates inputs and clamps waitSeconds', async () => {
    const cloudService = (await import('../CloudService.js')).default

    const invalidSession = await cloudService.getCheckoutStatus('  ', 10)
    const invalidWait = await cloudService.getCheckoutStatus('session', Number.NaN)
    expect(invalidSession).toEqual({ success: false, error: 'Invalid checkout session id' })
    expect(invalidWait).toEqual({ success: false, error: 'Invalid wait_seconds' })

    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: {
          session_id: 'session',
          status: 'completed',
          provider_status: 'completed',
          is_final: true,
          changed: true,
          amount_usd: 10,
          credits_added: 1000,
          created_at: '2026-02-01T00:00:00.000Z',
        },
      }),
    )

    const result = await cloudService.getCheckoutStatus('session', 99)

    expect(result.success).toBe(true)
    const [, , timeoutOptions] = mockAuthManager.fetchWithAuth.mock.calls.at(-1)
    expect(timeoutOptions.timeoutMs).toBe(50000)
  })

  it('getCheckoutStatus handles invalid normalized payload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: {
          session_id: 'session',
          status: 'completed',
          provider_status: 'not-supported',
          is_final: true,
          changed: true,
          amount_usd: 10,
          credits_added: 100,
          created_at: '2026-02-01T00:00:00.000Z',
        },
      }),
    )

    const result = await cloudService.getCheckoutStatus('session')
    expect(result).toEqual({ success: false, error: 'Invalid checkout status response' })
  })

  it('getCheckoutStatus handles non-OK response', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(500, { error: { message: 'status failed' } }))

    const result = await cloudService.getCheckoutStatus('session', 1)
    expect(result).toEqual({ success: false, error: 'status failed' })
  })

  it('reconcileCheckout validates session and payload', async () => {
    const cloudService = (await import('../CloudService.js')).default

    const invalid = await cloudService.reconcileCheckout('')
    expect(invalid).toEqual({ success: false, error: 'Invalid checkout session id' })

    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, { success: true, data: {} }))
    const invalidResponse = await cloudService.reconcileCheckout('session')
    expect(invalidResponse).toEqual({ success: false, error: 'Invalid checkout reconcile response' })
  })

  it('reconcileCheckout succeeds with normalized payload', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce(makeJsonResponse(200, {
      success: true,
      data: {
        session_id: 's1',
        order_id: 'o1',
        status: 'completed',
        provider_status: 'completed',
        is_final: true,
        changed: true,
        amount_usd: 10,
        credits_added: 1000,
        created_at: '2026-02-01T00:00:00.000Z',
      },
    }))

    const result = await cloudService.reconcileCheckout('s1')
    expect(result.success).toBe(true)
    expect(result.data?.session_id).toBe('s1')
  })

  it('credits and history methods return errors on HTTP failure', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockResolvedValue(makeJsonResponse(500, { error: { message: 'server error' } }))

    await expect(cloudService.getCredits()).resolves.toEqual({ success: false, error: 'server error' })
    await expect(cloudService.getCreditHistory(1, 10)).resolves.toEqual({ success: false, error: 'server error' })
    await expect(cloudService.getPaymentHistory(1, 10)).resolves.toEqual({ success: false, error: 'server error' })
  })

  it('credits and history methods succeed and return data/pagination', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonResponse(200, {
        success: true,
        data: {
          total_available: 100,
          bonus: {
            daily_remaining: 10,
            daily_limit: 200,
            daily_used: 0,
            balance: 10,
            daily_reset_at: '2026-03-01T00:00:00.000Z',
            monthly_reset_at: '2026-04-01T00:00:00.000Z',
          },
          paid: { balance: 90 },
        },
      }))
      .mockResolvedValueOnce(makeJsonResponse(200, {
        success: true,
        data: [{ id: 1 }],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      }))
      .mockResolvedValueOnce(makeJsonResponse(200, {
        success: true,
        data: [{ id: 2 }],
        pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
      }))

    const credits = await cloudService.getCredits()
    const creditHistory = await cloudService.getCreditHistory(1, 10, 'task')
    const paymentHistory = await cloudService.getPaymentHistory(1, 10)

    expect(credits.success).toBe(true)
    expect(creditHistory.success).toBe(true)
    expect(paymentHistory.success).toBe(true)
    expect(creditHistory.pagination?.page_size).toBe(10)
    expect(paymentHistory.pagination?.total).toBe(1)
  })

  it('history methods return invalid payload errors when success=false', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonResponse(200, { success: false, error: { message: 'bad credit history' } }))
      .mockResolvedValueOnce(makeJsonResponse(200, { success: false, error: { message: 'bad payment history' } }))

    const creditHistory = await cloudService.getCreditHistory(1, 10)
    const paymentHistory = await cloudService.getPaymentHistory(1, 10)

    expect(creditHistory).toEqual({ success: false, error: 'bad credit history' })
    expect(paymentHistory).toEqual({ success: false, error: 'bad payment history' })
  })

  it('normalizes JSON decode failures for convert/task/page/result methods', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonRejectResponse(200, 'convert json fail'))
      .mockResolvedValueOnce(makeJsonRejectResponse(200, 'tasks json fail'))
      .mockResolvedValueOnce(makeJsonRejectResponse(200, 'pages json fail'))
      .mockResolvedValueOnce(makeJsonRejectResponse(200, 'result json fail'))

    await expect(cloudService.convert({ name: 'a.pdf', content: new ArrayBuffer(4) })).resolves.toEqual({
      success: false,
      error: 'convert json fail',
    })
    await expect(cloudService.getTasks()).resolves.toEqual({ success: false, error: 'tasks json fail' })
    await expect(cloudService.getTaskPages('task-1')).resolves.toEqual({ success: false, error: 'pages json fail' })
    await expect(cloudService.getTaskResult('task-1')).resolves.toEqual({ success: false, error: 'result json fail' })
  })

  it('normalizes JSON decode failures for credit/payment history methods', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth
      .mockResolvedValueOnce(makeJsonRejectResponse(200, 'credit history json fail'))
      .mockResolvedValueOnce(makeJsonRejectResponse(200, 'payment history json fail'))

    await expect(cloudService.getCreditHistory()).resolves.toEqual({
      success: false,
      error: 'credit history json fail',
    })
    await expect(cloudService.getPaymentHistory()).resolves.toEqual({
      success: false,
      error: 'payment history json fail',
    })
  })

  it('methods return caught exception messages', async () => {
    const cloudService = (await import('../CloudService.js')).default
    mockAuthManager.fetchWithAuth.mockRejectedValue(new Error('network down'))

    const result = await cloudService.getTasks()
    expect(result).toEqual({ success: false, error: 'network down' })
  })
})
