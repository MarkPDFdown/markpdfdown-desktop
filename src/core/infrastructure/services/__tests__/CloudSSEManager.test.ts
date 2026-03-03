import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthManager = {
  getAccessToken: vi.fn(),
  fetchWithAuth: vi.fn(),
}

const mockWindowManager = {
  sendToRenderer: vi.fn(),
}

vi.mock('electron-is-dev', () => ({
  default: false,
}))

vi.mock('../AuthManager.js', () => ({
  authManager: mockAuthManager,
}))

vi.mock('../../../../main/WindowManager.js', () => ({
  windowManager: mockWindowManager,
}))

const createStream = (chunks: string[]) => {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

describe('CloudSSEManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useRealTimers()

    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any
    manager.connected = false
    manager.lastEventId = '0'
    manager.reconnectDelay = 1000
    manager.cleanup()
  })

  it('connect skips when no token', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    mockAuthManager.getAccessToken.mockResolvedValueOnce('')

    await cloudSSEManager.connect()

    expect(mockAuthManager.fetchWithAuth).not.toHaveBeenCalled()
    expect((cloudSSEManager as any).connected).toBe(false)
  })

  it('connect short-circuits when already connected', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    ;(cloudSSEManager as any).connected = true

    await cloudSSEManager.connect()

    expect(mockAuthManager.getAccessToken).not.toHaveBeenCalled()
  })

  it('disconnect preserves lastEventId and clears connected flag', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    ;(cloudSSEManager as any).connected = true
    ;(cloudSSEManager as any).lastEventId = '99'

    cloudSSEManager.disconnect()

    expect((cloudSSEManager as any).connected).toBe(false)
    expect((cloudSSEManager as any).lastEventId).toBe('99')
  })

  it('resetAndDisconnect clears lastEventId', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    ;(cloudSSEManager as any).lastEventId = '99'

    cloudSSEManager.resetAndDisconnect()

    expect((cloudSSEManager as any).lastEventId).toBe('0')
    expect((cloudSSEManager as any).connected).toBe(false)
  })

  it('startStream schedules reconnect on HTTP error', async () => {
    vi.useFakeTimers()
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    manager.connected = true
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: vi.fn(() => 'text/event-stream') },
    })

    await manager.startStream()

    expect(manager.reconnectTimer).toBeTruthy()
    vi.runOnlyPendingTimers()
  })

  it('startStream schedules reconnect on invalid content type', async () => {
    vi.useFakeTimers()
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    manager.connected = true
    mockAuthManager.fetchWithAuth.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: vi.fn(() => 'application/json') },
      body: createStream(['{}']),
    })

    await manager.startStream()

    expect(manager.reconnectTimer).toBeTruthy()
    vi.runOnlyPendingTimers()
  })

  it('parseSSEMessage forwards known events and updates lastEventId', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    manager.parseSSEMessage('id: 7\nevent: page_completed\ndata: {"task_id":"task-1","page":3}')

    expect(manager.lastEventId).toBe('7')
    expect(mockWindowManager.sendToRenderer).toHaveBeenCalledWith(
      'cloud:taskEvent',
      expect.objectContaining({
        type: 'page_completed',
        data: { task_id: 'task-1', page: 3 },
      }),
    )
  })

  it('parseSSEMessage ignores heartbeat and connected events', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    manager.parseSSEMessage('event: heartbeat\ndata: {}')
    manager.parseSSEMessage('event: connected\ndata: {}')

    expect(mockWindowManager.sendToRenderer).not.toHaveBeenCalled()
  })

  it('parseSSEMessage ignores unknown event types', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    manager.parseSSEMessage('event: unknown\ndata: {"task_id":"task-1"}')
    expect(mockWindowManager.sendToRenderer).not.toHaveBeenCalled()
  })

  it('parseSSEMessage tolerates invalid JSON payload', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    manager.parseSSEMessage('event: page_completed\ndata: not-json')
    expect(mockWindowManager.sendToRenderer).not.toHaveBeenCalled()
  })

  it('readStream parses CRLF chunks and reconnects when stream ends naturally', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any
    manager.connected = true

    const reconnectSpy = vi.spyOn(manager, 'reconnect').mockResolvedValue(undefined)

    await manager.readStream(
      createStream([
        'id: 1\r\nevent: page_started\r\ndata: {"task_id":"task-1","page":1}\r\n\r\n',
        'id: 2\nevent: page_failed\ndata: {"task_id":"task-1","page":1}\n\n',
      ]),
    )

    expect(mockWindowManager.sendToRenderer).toHaveBeenCalledTimes(2)
    expect(reconnectSpy).toHaveBeenCalled()
  })

  it('connect calls startStream and resets delay after successful stream', async () => {
    const { cloudSSEManager } = await import('../CloudSSEManager.js')
    const manager = cloudSSEManager as any

    mockAuthManager.getAccessToken.mockResolvedValueOnce('token')
    const startStreamSpy = vi.spyOn(manager, 'startStream').mockResolvedValue(undefined)

    await cloudSSEManager.connect()

    expect(startStreamSpy).toHaveBeenCalled()
    expect(manager.connected).toBe(true)
  })
})
