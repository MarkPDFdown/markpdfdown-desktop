import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateChecker from '../UpdateChecker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'update.checking': 'Checking updates',
        'update.available': 'Update available',
        'update.downloading': 'Downloading',
        'update.ready': 'Ready to install',
        'update.restart_to_update': 'Restart now',
        'update.up_to_date': 'Up to date',
        'update.error': 'Update error',
        'update.retry': 'Retry',
        'update.check_for_updates': 'Check updates',
      }
      return map[key] || key
    },
    i18n: { changeLanguage: vi.fn() },
  }),
}))

describe('UpdateChecker', () => {
  let updaterStatusCb: ((data: any) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    updaterStatusCb = undefined

    vi.mocked(window.api.events.onUpdaterStatus).mockImplementation((cb: any) => {
      updaterStatusCb = cb
      return () => {
        updaterStatusCb = undefined
      }
    })
  })

  it('shows check button in idle status', () => {
    render(<UpdateChecker />)
    expect(screen.getByText('Check updates')).toBeInTheDocument()
  })

  it('calls updater.checkForUpdates when user clicks button', () => {
    render(<UpdateChecker />)
    fireEvent.click(screen.getByText('Check updates'))
    expect(window.api.updater.checkForUpdates).toHaveBeenCalled()
  })

  it('renders available/downloading/downloaded states from event stream', async () => {
    render(<UpdateChecker />)

    updaterStatusCb?.({ status: 'available', version: '1.2.3' })
    await waitFor(() => {
      expect(screen.getByText(/Update available/)).toBeInTheDocument()
      expect(screen.getByText(/v1.2.3/)).toBeInTheDocument()
    })

    updaterStatusCb?.({ status: 'downloading', progress: 45.6 })
    await waitFor(() => {
      expect(screen.getByText(/Downloading/)).toBeInTheDocument()
      expect(screen.getByText(/45.6%/)).toBeInTheDocument()
    })

    updaterStatusCb?.({ status: 'downloaded', version: '1.2.3' })
    await waitFor(() => {
      expect(screen.getByText(/Ready to install/)).toBeInTheDocument()
      expect(screen.getByText('Restart now')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Restart now'))
    expect(window.api.updater.quitAndInstall).toHaveBeenCalled()
  })

  it('renders not_available and error states', async () => {
    render(<UpdateChecker />)

    updaterStatusCb?.({ status: 'not_available' })
    await waitFor(() => {
      expect(screen.getByText('Up to date')).toBeInTheDocument()
    })

    updaterStatusCb?.({ status: 'error', error: 'network failed' })
    await waitFor(() => {
      expect(screen.getByText('Update error')).toBeInTheDocument()
      expect(screen.getByText('network failed')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })
})
