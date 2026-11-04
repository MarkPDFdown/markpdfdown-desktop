import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import DatabaseStatusAlert from '../DatabaseStatusAlert'

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
