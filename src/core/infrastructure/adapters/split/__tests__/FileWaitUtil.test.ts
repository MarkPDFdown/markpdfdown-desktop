import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileWaitUtil } from '../FileWaitUtil'

const { mockAccess, mockStat, mockReaddir } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockStat: vi.fn(),
  mockReaddir: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    access: mockAccess,
    stat: mockStat,
    readdir: mockReaddir,
  },
}))

describe('FileWaitUtil', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns immediately when file is accessible and non-empty', async () => {
    mockAccess.mockResolvedValueOnce(undefined)
    mockStat.mockResolvedValueOnce({ size: 123 })

    await FileWaitUtil.waitForFile('/uploads/t1/a.pdf', '/uploads', 't1', 'a.pdf', 'PDFSplitter')

    expect(mockAccess).toHaveBeenCalledWith('/uploads/t1/a.pdf')
    expect(mockStat).toHaveBeenCalledWith('/uploads/t1/a.pdf')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('retries until file becomes available', async () => {
    mockAccess
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
    mockStat
      .mockResolvedValueOnce({ size: 0 })
      .mockResolvedValueOnce({ size: 10 })

    const promise = FileWaitUtil.waitForFile('/uploads/t1/a.pdf', '/uploads', 't1', 'a.pdf', 'PDFSplitter')
    await vi.advanceTimersByTimeAsync(2000)
    await promise

    expect(mockAccess).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 3'))
  })

  it('logs existing task directory diagnostics then throws on exhaustion', async () => {
    mockAccess.mockRejectedValue(new Error('missing'))
    mockStat.mockResolvedValueOnce({ size: 1 })
    mockReaddir.mockResolvedValueOnce(['other.txt'])

    const expectation = expect(
      FileWaitUtil.waitForFile('/uploads/t2/a.pdf', '/uploads', 't2', 'a.pdf', 'PDFSplitter'),
    ).rejects.toThrow('PDF file not found: a.pdf')
    await vi.runAllTimersAsync()

    await expectation
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Task directory exists but target file not found.'),
    )
  })

  it('logs missing task directory diagnostics then throws on exhaustion', async () => {
    mockAccess.mockRejectedValue(new Error('missing'))
    mockStat.mockRejectedValueOnce(new Error('no dir'))

    const expectation = expect(
      FileWaitUtil.waitForFile('/uploads/t3/a.png', '/uploads', 't3', 'a.png', 'ImageSplitter'),
    ).rejects.toThrow('Image file not found: a.png')
    await vi.runAllTimersAsync()

    await expectation
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Task directory does not exist'))
  })

  it('handles diagnostics read failure gracefully', async () => {
    mockAccess.mockRejectedValue(new Error('missing'))
    mockStat.mockResolvedValueOnce({ size: 1 })
    mockReaddir.mockRejectedValueOnce(new Error('io fail'))

    const expectation = expect(
      FileWaitUtil.waitForFile('/uploads/t4/a.png', '/uploads', 't4', 'a.png', 'ImageSplitter'),
    ).rejects.toThrow('Image file not found: a.png')
    await vi.runAllTimersAsync()

    await expectation
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Diagnostic check failed:'),
      expect.any(Error),
    )
  })
})
