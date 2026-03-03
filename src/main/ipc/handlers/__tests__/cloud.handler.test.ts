import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: any[]) => any>()

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    handlers.set(channel, handler)
  }),
}

const mockDialog = {
  showSaveDialog: vi.fn(),
}

const mockApp = {
  getPath: vi.fn(() => '/downloads'),
}

const mockFs = {
  promises: {
    stat: vi.fn(),
  },
  writeFileSync: vi.fn(),
}

const mockCloudService = {
  convert: vi.fn(),
  getTasks: vi.fn(),
  getTaskById: vi.fn(),
  getTaskPages: vi.fn(),
  cancelTask: vi.fn(),
  retryTask: vi.fn(),
  deleteTask: vi.fn(),
  retryPage: vi.fn(),
  getTaskResult: vi.fn(),
  downloadPdf: vi.fn(),
  getPageImage: vi.fn(),
  createCheckout: vi.fn(),
  getCheckoutStatus: vi.fn(),
  reconcileCheckout: vi.fn(),
  getCredits: vi.fn(),
  getCreditHistory: vi.fn(),
  getPaymentHistory: vi.fn(),
}

const mockSSEManager = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  resetAndDisconnect: vi.fn(),
}

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  app: mockApp,
}))

vi.mock('fs', () => ({
  default: mockFs,
}))

vi.mock('../../../../core/infrastructure/services/CloudService.js', () => ({
  default: mockCloudService,
}))

vi.mock('../../../../core/infrastructure/services/CloudSSEManager.js', () => ({
  cloudSSEManager: mockSSEManager,
}))

describe('cloud.handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handlers.clear()

    const mod = await import('../cloud.handler.js')
    mod.registerCloudHandlers()
  })

  it('registers cloud handlers', () => {
    expect(handlers.has('cloud:convert')).toBe(true)
    expect(handlers.has('cloud:getTasks')).toBe(true)
    expect(handlers.has('cloud:downloadPdf')).toBe(true)
    expect(handlers.has('cloud:sseConnect')).toBe(true)
  })

  describe('cloud:convert', () => {
    it('validates missing path/content', async () => {
      const result = await handlers.get('cloud:convert')!({}, { name: 'a.pdf' })
      expect(result).toEqual({ success: false, error: 'No file content or path provided' })
    })

    it('validates content too large', async () => {
      const tooLarge = new ArrayBuffer(100 * 1024 * 1024 + 1)
      const result = await handlers.get('cloud:convert')!({}, { name: 'a.pdf', content: tooLarge })
      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    it('validates path stat failure', async () => {
      mockFs.promises.stat.mockRejectedValueOnce(new Error('missing'))
      const result = await handlers.get('cloud:convert')!({}, { name: 'a.pdf', path: '/tmp/a.pdf' })
      expect(result).toEqual({ success: false, error: 'File not found or not accessible' })
    })

    it('validates path too large', async () => {
      mockFs.promises.stat.mockResolvedValueOnce({ size: 100 * 1024 * 1024 + 1 })
      const result = await handlers.get('cloud:convert')!({}, { name: 'a.pdf', path: '/tmp/a.pdf' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    it('delegates conversion to cloudService', async () => {
      mockFs.promises.stat.mockResolvedValueOnce({ size: 1024 })
      mockCloudService.convert.mockResolvedValueOnce({ success: true, data: { task_id: 't1' } })

      const payload = { name: 'a.pdf', path: '/tmp/a.pdf', model: 'pro' }
      const result = await handlers.get('cloud:convert')!({}, payload)

      expect(mockCloudService.convert).toHaveBeenCalledWith(payload)
      expect(result).toEqual({ success: true, data: { task_id: 't1' } })
    })

    it('returns error when cloudService throws', async () => {
      mockCloudService.convert.mockRejectedValueOnce(new Error('convert boom'))
      const result = await handlers.get('cloud:convert')!({}, { name: 'a.pdf', content: new ArrayBuffer(16) })

      expect(result).toEqual({ success: false, error: 'convert boom' })
    })
  })

  it('delegates list/get/retry/delete handlers', async () => {
    mockCloudService.getTasks.mockResolvedValueOnce({ success: true, data: [] })
    mockCloudService.getTaskById.mockResolvedValueOnce({ success: true, data: { id: 't1' } })
    mockCloudService.retryTask.mockResolvedValueOnce({ success: true, data: { task_id: 'new' } })
    mockCloudService.deleteTask.mockResolvedValueOnce({ success: true, data: { id: 't1' } })

    await handlers.get('cloud:getTasks')!({}, { page: 2, pageSize: 20 })
    await handlers.get('cloud:getTaskById')!({}, 't1')
    await handlers.get('cloud:retryTask')!({}, 't1')
    await handlers.get('cloud:deleteTask')!({}, 't1')

    expect(mockCloudService.getTasks).toHaveBeenCalledWith(2, 20)
    expect(mockCloudService.getTaskById).toHaveBeenCalledWith('t1')
    expect(mockCloudService.retryTask).toHaveBeenCalledWith('t1')
    expect(mockCloudService.deleteTask).toHaveBeenCalledWith('t1')
  })

  describe('cloud:downloadPdf', () => {
    it('returns service error when download fails', async () => {
      mockCloudService.downloadPdf.mockResolvedValueOnce({ success: false, error: 'bad' })
      const result = await handlers.get('cloud:downloadPdf')!({}, 'task-1')
      expect(result).toEqual({ success: false, error: 'bad' })
    })

    it('handles cancelled save dialog', async () => {
      mockCloudService.downloadPdf.mockResolvedValueOnce({
        success: true,
        data: {
          buffer: new ArrayBuffer(8),
          fileName: 'demo.pdf',
        },
      })
      mockDialog.showSaveDialog.mockResolvedValueOnce({ canceled: true })

      const result = await handlers.get('cloud:downloadPdf')!({}, 'task-1')
      expect(result).toEqual({ success: false, error: 'Cancelled' })
      expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    })

    it('writes file when save dialog succeeds', async () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer
      mockCloudService.downloadPdf.mockResolvedValueOnce({
        success: true,
        data: { buffer, fileName: 'demo.pdf' },
      })
      mockDialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/downloads/demo.pdf' })

      const result = await handlers.get('cloud:downloadPdf')!({}, 'task-1')

      expect(mockApp.getPath).toHaveBeenCalledWith('downloads')
      expect(mockFs.writeFileSync).toHaveBeenCalled()
      expect(result).toEqual({ success: true, data: { filePath: '/downloads/demo.pdf' } })
    })
  })

  describe('checkout/payment validation', () => {
    it('validates amount for createCheckout', async () => {
      const result = await handlers.get('cloud:createCheckout')!({}, { amountUsd: 0 })
      expect(result).toEqual({ success: false, error: 'Invalid amountUsd' })
    })

    it('validates sessionId and waitSeconds for getCheckoutStatus', async () => {
      const invalidSession = await handlers.get('cloud:getCheckoutStatus')!({}, { sessionId: '  ' })
      const invalidWait = await handlers.get('cloud:getCheckoutStatus')!({}, { sessionId: 's1', waitSeconds: Number.NaN })

      expect(invalidSession).toEqual({ success: false, error: 'Invalid sessionId' })
      expect(invalidWait).toEqual({ success: false, error: 'Invalid waitSeconds' })
    })

    it('validates sessionId for reconcileCheckout', async () => {
      const result = await handlers.get('cloud:reconcileCheckout')!({}, { sessionId: '' })
      expect(result).toEqual({ success: false, error: 'Invalid sessionId' })
    })

    it('validates getPaymentHistory page params', async () => {
      const badPage = await handlers.get('cloud:getPaymentHistory')!({}, { page: 0, pageSize: 10 })
      const badPageSize = await handlers.get('cloud:getPaymentHistory')!({}, { page: 1, pageSize: 0 })
      expect(badPage).toEqual({ success: false, error: 'Invalid page' })
      expect(badPageSize).toEqual({ success: false, error: 'Invalid pageSize' })
    })

    it('delegates checkout, history and image handlers', async () => {
      mockCloudService.createCheckout.mockResolvedValueOnce({ success: true, data: { session_id: 's1' } })
      mockCloudService.getCheckoutStatus.mockResolvedValueOnce({ success: true, data: { session_id: 's1' } })
      mockCloudService.reconcileCheckout.mockResolvedValueOnce({ success: true, data: { session_id: 's1' } })
      mockCloudService.getCredits.mockResolvedValueOnce({ success: true, data: { total_available: 1 } })
      mockCloudService.getCreditHistory.mockResolvedValueOnce({ success: true, data: [] })
      mockCloudService.getPaymentHistory.mockResolvedValueOnce({ success: true, data: [] })
      mockCloudService.getPageImage.mockResolvedValueOnce({ success: true, data: { dataUrl: 'data:image/png;base64,abc' } })

      await handlers.get('cloud:createCheckout')!({}, { amountUsd: 10 })
      await handlers.get('cloud:getCheckoutStatus')!({}, { sessionId: '  s1  ', waitSeconds: 9 })
      await handlers.get('cloud:reconcileCheckout')!({}, { sessionId: ' s1 ' })
      await handlers.get('cloud:getCredits')!({}, undefined)
      await handlers.get('cloud:getCreditHistory')!({}, { page: 1, pageSize: 20, type: 'task' })
      await handlers.get('cloud:getPaymentHistory')!({}, { page: 1, pageSize: 20 })
      await handlers.get('cloud:getPageImage')!({}, { taskId: 'task-1', pageNumber: 3 })

      expect(mockCloudService.createCheckout).toHaveBeenCalledWith(10)
      expect(mockCloudService.getCheckoutStatus).toHaveBeenCalledWith('s1', 9)
      expect(mockCloudService.reconcileCheckout).toHaveBeenCalledWith('s1')
      expect(mockCloudService.getCredits).toHaveBeenCalled()
      expect(mockCloudService.getCreditHistory).toHaveBeenCalledWith(1, 20, 'task')
      expect(mockCloudService.getPaymentHistory).toHaveBeenCalledWith(1, 20)
      expect(mockCloudService.getPageImage).toHaveBeenCalledWith('task-1', 3)
    })
  })

  describe('delegated handler error wrapping', () => {
    it('wraps delegated cloud method errors', async () => {
      const cases: Array<{
        channel: string
        args: any
        mock: ReturnType<typeof vi.fn>
        expected: string
      }> = [
        { channel: 'cloud:getTasks', args: { page: 1, pageSize: 10 }, mock: mockCloudService.getTasks, expected: 'tasks boom' },
        { channel: 'cloud:getTaskById', args: 't1', mock: mockCloudService.getTaskById, expected: 'task boom' },
        { channel: 'cloud:getTaskPages', args: { taskId: 't1', page: 1, pageSize: 10 }, mock: mockCloudService.getTaskPages, expected: 'pages boom' },
        { channel: 'cloud:cancelTask', args: 't1', mock: mockCloudService.cancelTask, expected: 'cancel boom' },
        { channel: 'cloud:retryTask', args: 't1', mock: mockCloudService.retryTask, expected: 'retry boom' },
        { channel: 'cloud:deleteTask', args: 't1', mock: mockCloudService.deleteTask, expected: 'delete boom' },
        { channel: 'cloud:retryPage', args: { taskId: 't1', pageNumber: 1 }, mock: mockCloudService.retryPage, expected: 'retry page boom' },
        { channel: 'cloud:getTaskResult', args: 't1', mock: mockCloudService.getTaskResult, expected: 'result boom' },
        { channel: 'cloud:getPageImage', args: { taskId: 't1', pageNumber: 1 }, mock: mockCloudService.getPageImage, expected: 'image boom' },
        { channel: 'cloud:createCheckout', args: { amountUsd: 10 }, mock: mockCloudService.createCheckout, expected: 'checkout boom' },
        { channel: 'cloud:getCheckoutStatus', args: { sessionId: 's1', waitSeconds: 1 }, mock: mockCloudService.getCheckoutStatus, expected: 'status boom' },
        { channel: 'cloud:reconcileCheckout', args: { sessionId: 's1' }, mock: mockCloudService.reconcileCheckout, expected: 'reconcile boom' },
        { channel: 'cloud:getCredits', args: undefined, mock: mockCloudService.getCredits, expected: 'credits boom' },
        { channel: 'cloud:getCreditHistory', args: { page: 1, pageSize: 10 }, mock: mockCloudService.getCreditHistory, expected: 'credit history boom' },
        { channel: 'cloud:getPaymentHistory', args: { page: 1, pageSize: 10 }, mock: mockCloudService.getPaymentHistory, expected: 'payment history boom' },
      ]

      for (const t of cases) {
        t.mock.mockReset()
      }

      cases[0].mock.mockRejectedValueOnce(new Error(cases[0].expected))
      cases[1].mock.mockRejectedValueOnce(new Error(cases[1].expected))
      cases[2].mock.mockRejectedValueOnce(new Error(cases[2].expected))
      cases[3].mock.mockRejectedValueOnce(new Error(cases[3].expected))
      cases[4].mock.mockRejectedValueOnce(new Error(cases[4].expected))
      cases[5].mock.mockRejectedValueOnce(new Error(cases[5].expected))
      cases[6].mock.mockRejectedValueOnce(new Error(cases[6].expected))
      cases[7].mock.mockRejectedValueOnce(new Error(cases[7].expected))
      cases[8].mock.mockRejectedValueOnce(new Error(cases[8].expected))
      cases[9].mock.mockRejectedValueOnce(new Error(cases[9].expected))
      cases[10].mock.mockRejectedValueOnce(new Error(cases[10].expected))
      cases[11].mock.mockRejectedValueOnce(new Error(cases[11].expected))
      cases[12].mock.mockRejectedValueOnce(new Error(cases[12].expected))
      cases[13].mock.mockRejectedValueOnce(new Error(cases[13].expected))
      cases[14].mock.mockRejectedValueOnce(new Error(cases[14].expected))

      for (const t of cases) {
        const result = await handlers.get(t.channel)!({}, t.args)
        expect(result).toEqual({ success: false, error: t.expected })
      }
    })
  })

  describe('sse handlers', () => {
    it('connect/disconnect/reset handlers call sse manager', async () => {
      expect(await handlers.get('cloud:sseConnect')!({}, undefined)).toEqual({ success: true })
      expect(await handlers.get('cloud:sseDisconnect')!({}, undefined)).toEqual({ success: true })
      expect(await handlers.get('cloud:sseResetAndDisconnect')!({}, undefined)).toEqual({ success: true })

      expect(mockSSEManager.connect).toHaveBeenCalled()
      expect(mockSSEManager.disconnect).toHaveBeenCalled()
      expect(mockSSEManager.resetAndDisconnect).toHaveBeenCalled()
    })

    it('returns error if sse connect throws', async () => {
      mockSSEManager.connect.mockRejectedValueOnce(new Error('sse failed'))
      const result = await handlers.get('cloud:sseConnect')!({}, undefined)
      expect(result).toEqual({ success: false, error: 'sse failed' })
    })
  })

  it('returns wrapped errors for delegated calls', async () => {
    mockCloudService.getCredits.mockRejectedValueOnce(new Error('credits error'))
    const result = await handlers.get('cloud:getCredits')!({}, undefined)

    expect(result).toEqual({ success: false, error: 'credits error' })
  })
})
