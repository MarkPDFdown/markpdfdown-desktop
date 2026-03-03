import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { App } from 'antd'
import AccountCenter from '../AccountCenter'
import { CloudContext, type CloudContextType } from '../../contexts/CloudContextDefinition'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
}))

const createCloudContextValue = (overrides: Partial<CloudContextType> = {}): CloudContextType => ({
  user: {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    avatarUrl: null,
    isLoaded: true,
    isSignedIn: true,
  },
  credits: {
    total: 1000,
    free: 200,
    paid: 800,
    dailyLimit: 200,
    usedToday: 0,
    bonusBalance: 200,
    dailyResetAt: '',
    monthlyResetAt: '',
  },
  isAuthenticated: true,
  isLoading: false,
  deviceFlowStatus: 'idle',
  userCode: null,
  verificationUrl: null,
  authError: null,
  login: vi.fn(),
  logout: vi.fn(),
  cancelLogin: vi.fn(),
  refreshCredits: vi.fn().mockResolvedValue(undefined),
  convertFile: vi.fn().mockResolvedValue({ success: false, error: 'not used' }),
  getTasks: vi.fn().mockResolvedValue({ success: true, data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
  getTaskById: vi.fn().mockResolvedValue({ success: false, error: 'not used' }),
  getTaskPages: vi.fn().mockResolvedValue({ success: true, data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
  cancelTask: vi.fn().mockResolvedValue({ success: true }),
  retryTask: vi.fn().mockResolvedValue({ success: true, data: { task_id: 'task-1' } }),
  deleteTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1', message: 'ok' } }),
  retryPage: vi.fn().mockResolvedValue({ success: true }),
  getTaskResult: vi.fn().mockResolvedValue({ success: false, error: 'not used' }),
  downloadResult: vi.fn().mockResolvedValue({ success: false, error: 'not used' }),
  createCheckout: vi.fn().mockResolvedValue({
    success: true,
    data: {
      checkoutUrl: 'https://example.com/checkout',
      sessionId: 'session-1',
      amountUsd: 20,
      creditsToAdd: 32000,
    },
  }),
  getCheckoutStatus: vi.fn().mockResolvedValue({ success: false, error: 'Request timeout' }),
  reconcileCheckout: vi.fn().mockResolvedValue({ success: false, error: 'not used' }),
  getCreditHistory: vi.fn().mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 },
  }),
  getPaymentHistory: vi.fn().mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 },
  }),
  ...overrides,
})

const renderWithContext = (value: CloudContextType) => render(
  <App>
    <CloudContext.Provider value={value}>
      <AccountCenter />
    </CloudContext.Provider>
  </App>,
)

describe('AccountCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window.api as any).shell = {
      openExternal: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('stops checkout polling when authentication is lost', async () => {
    const getCheckoutStatus = vi.fn().mockResolvedValue({ success: false, error: 'Request timeout' })
    const createCheckout = vi.fn().mockResolvedValue({
      success: true,
      data: {
        checkoutUrl: 'https://example.com/checkout',
        sessionId: 'session-1',
        amountUsd: 20,
        creditsToAdd: 32000,
      },
    })

    const authenticatedValue = createCloudContextValue({
      isAuthenticated: true,
      createCheckout,
      getCheckoutStatus,
    })

    const loggedOutValue = createCloudContextValue({
      isAuthenticated: false,
      createCheckout,
      getCheckoutStatus,
    })

    const { rerender } = renderWithContext(authenticatedValue)

    fireEvent.click(screen.getByRole('button', { name: /paid_credits\.recharge/i }))

    await waitFor(() => {
      expect(createCheckout).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(getCheckoutStatus).toHaveBeenCalledTimes(1)
    })

    rerender(
      <App>
        <CloudContext.Provider value={loggedOutValue}>
          <AccountCenter />
        </CloudContext.Provider>
      </App>,
    )

    await new Promise((resolve) => setTimeout(resolve, 1800))
    expect(getCheckoutStatus).toHaveBeenCalledTimes(1)
  })

  it('shows fullscreen celebration when payment is completed', async () => {
    const getCheckoutStatus = vi.fn().mockResolvedValue({
      success: true,
      data: {
        sessionId: 'session-1',
        orderId: 'order-1',
        status: 'completed',
        providerStatus: 'completed',
        isFinal: true,
        changed: true,
        amountUsd: 20,
        creditsAdded: 32000,
        createdAt: new Date().toISOString(),
      },
    })

    const value = createCloudContextValue({
      getCheckoutStatus,
    })

    renderWithContext(value)

    fireEvent.click(screen.getByRole('button', { name: /paid_credits\.recharge/i }))

    await waitFor(() => {
      expect(getCheckoutStatus).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('payment-success-celebration')).toBeInTheDocument()
    })
  })
})
