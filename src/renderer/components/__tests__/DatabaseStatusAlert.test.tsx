import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import DatabaseStatusAlert from '../DatabaseStatusAlert'
import arSA from '../../locales/ar-SA/common.json'
import enUS from '../../locales/en-US/common.json'
import faIR from '../../locales/fa-IR/common.json'
import jaJP from '../../locales/ja-JP/common.json'
import ruRU from '../../locales/ru-RU/common.json'
import zhCN from '../../locales/zh-CN/common.json'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const getDatabaseStatus = vi.fn()

describe('DatabaseStatusAlert', () => {
  beforeEach(() => {
    getDatabaseStatus.mockReset()
    vi.stubGlobal('api', { app: { getDatabaseStatus } })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows nothing when the database is fine', async () => {
    getDatabaseStatus.mockResolvedValue({ success: true })

    const { container } = render(<DatabaseStatusAlert />)

    await waitFor(() => expect(getDatabaseStatus).toHaveBeenCalled())
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing while the initialization is still running', () => {
    getDatabaseStatus.mockReturnValue(new Promise(() => {}))

    const { container } = render(<DatabaseStatusAlert />)

    expect(container).toBeEmptyDOMElement()
  })

  it('explains the failure and gives the underlying error', async () => {
    getDatabaseStatus.mockResolvedValue({
      success: false,
      error: 'Prisma Client could not locate the Query Engine'
    })

    render(<DatabaseStatusAlert />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('databaseError.title')).toBeInTheDocument()
    expect(screen.getByText('databaseError.description')).toBeInTheDocument()
    expect(screen.getByText('Prisma Client could not locate the Query Engine')).toBeInTheDocument()
  })

  it('does not suggest rebuilding the database when a new one would fail as well', async () => {
    getDatabaseStatus.mockResolvedValue({ success: false, error: 'no engine' })

    render(<DatabaseStatusAlert />)

    await screen.findByRole('alert')
    expect(screen.queryByText('databaseError.rebuild.description')).not.toBeInTheDocument()
  })

  it('gives the database path and the steps to rebuild it when the database is what fails', async () => {
    getDatabaseStatus.mockResolvedValue({
      success: false,
      error: 'Failed to apply migration 20250414154412_',
      databasePath: '/home/user/.config/markpdfdown/db/app.db'
    })

    render(<DatabaseStatusAlert />)

    expect(await screen.findByText('/home/user/.config/markpdfdown/db/app.db')).toBeInTheDocument()
    // Restarting is what it would otherwise say, and it can't help here.
    expect(screen.queryByText('databaseError.description')).not.toBeInTheDocument()
    expect(screen.getByText('databaseError.rebuild.description')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((item) => item.firstChild?.textContent)).toEqual([
      'databaseError.rebuild.quit',
      'databaseError.rebuild.moveFile',
      'databaseError.rebuild.reopen',
      'databaseError.rebuild.stillFailing'
    ])
    expect(screen.getByText('Failed to apply migration 20250414154412_')).toBeInTheDocument()
  })

  it('has the rebuild steps in every language', () => {
    const expected = Object.keys(enUS.databaseError.rebuild)

    for (const locale of [arSA, enUS, faIR, jaJP, ruRU, zhCN]) {
      expect(Object.keys(locale.databaseError.rebuild)).toEqual(expected)
      expect(Object.values(locale.databaseError.rebuild).every(Boolean)).toBe(true)
    }
  })

  it('still shows the alert when the failure has no message', async () => {
    getDatabaseStatus.mockResolvedValue({ success: false })

    render(<DatabaseStatusAlert />)

    expect(await screen.findByText('databaseError.title')).toBeInTheDocument()
  })

  it('treats a failed status request as a failure', async () => {
    getDatabaseStatus.mockRejectedValue(new Error('No handler registered'))

    render(<DatabaseStatusAlert />)

    expect(await screen.findByText('No handler registered')).toBeInTheDocument()
  })
})
