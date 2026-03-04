import { App } from 'antd'
import { render, waitFor } from '@testing-library/react'
import React, { useContext } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudProvider } from '../CloudContext'
import { CloudContext, type CloudContextType } from '../CloudContextDefinition'

let latestContext: CloudContextType | undefined

const Probe = () => {
  latestContext = useContext(CloudContext)
  return <div data-testid="probe">{latestContext?.isAuthenticated ? 'auth' : 'anon'}</div>
}

const renderProvider = () =>
  render(
    <App>
      <CloudProvider>
        <Probe />
      </CloudProvider>
    </App>,
  )

describe('CloudContext', () => {
  let authStateListener: ((state: any) => void) | undefined
  let paymentListener: ((event: any) => void) | undefined
  const setAuthenticatedState = () => {
    vi.mocked(window.api.auth.getAuthState).mockResolvedValueOnce({
      success: true,
      data: {
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 1,
          email: 'u@example.com',
          name: 'User',
          avatar_url: null,
        },
        deviceFlowStatus: 'idle',
        userCode: null,
        verificationUrl: null,
        error: null,
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    latestContext = undefined
    authStateListener = undefined
    paymentListener = undefined

    vi.mocked(window.api.auth.getAuthState).mockResolvedValue({
      success: true,
      data: {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        deviceFlowStatus: 'idle',
        userCode: null,
        verificationUrl: null,
        error: null,
      },
    })

    vi.mocked(window.api.events.onAuthStateChanged).mockImplementation((callback: any) => {
      authStateListener = callback
      return () => {
        authStateListener = undefined
      }
    })

    vi.mocked(window.api.events.onPaymentCallback).mockImplementation((callback: any) => {
      paymentListener = callback
      return () => {
        paymentListener = undefined
      }
    })

    vi.mocked(window.api.cloud.getCredits).mockResolvedValue({
      success: true,
      data: {
        total_available: 120,
        bonus: {
          daily_remaining: 20,
          daily_limit: 200,
          daily_used: 10,
          balance: 50,
          daily_reset_at: '2026-03-04T00:00:00.000Z',
          monthly_reset_at: '2026-04-01T00:00:00.000Z',
        },
        paid: {
          balance: 70,
        },
      },
    })
  })

  it('loads initial auth state and listens for updates', async () => {
    renderProvider()

    await waitFor(() => {
      expect(window.api.auth.getAuthState).toHaveBeenCalled()
      expect(latestContext?.isLoading).toBe(false)
      expect(latestContext?.isAuthenticated).toBe(false)
    })

    authStateListener?.({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 1,
        email: 'u@example.com',
        name: 'User',
        avatar_url: null,
      },
      deviceFlowStatus: 'idle',
      userCode: null,
      verificationUrl: null,
      error: null,
    })

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true)
      expect(latestContext?.user.email).toBe('u@example.com')
      expect(latestContext?.user.isSignedIn).toBe(true)
    })
  })

  it('handles getAuthState failure with default user state', async () => {
    vi.mocked(window.api.auth.getAuthState).mockRejectedValueOnce(new Error('boom'))
    renderProvider()

    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false)
      expect(latestContext?.user.isLoaded).toBe(true)
      expect(latestContext?.isAuthenticated).toBe(false)
    })
  })

  it('login/cancel/logout delegate to auth APIs', async () => {
    renderProvider()

    await waitFor(() => {
      expect(latestContext).toBeTruthy()
    })

    latestContext?.login()
    latestContext?.cancelLogin()
    await latestContext?.logout()

    expect(window.api.auth.login).toHaveBeenCalled()
    expect(window.api.auth.cancelLogin).toHaveBeenCalled()
    expect(window.api.auth.logout).toHaveBeenCalled()
  })

  it('refreshCredits maps cloud response after auth', async () => {
    vi.mocked(window.api.auth.getAuthState).mockResolvedValueOnce({
      success: true,
      data: {
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 1,
          email: 'u@example.com',
          name: 'User',
          avatar_url: null,
        },
        deviceFlowStatus: 'idle',
        userCode: null,
        verificationUrl: null,
        error: null,
      },
    })

    renderProvider()

    await waitFor(() => {
      expect(window.api.cloud.getCredits).toHaveBeenCalled()
      expect(latestContext?.credits.total).toBe(120)
      expect(latestContext?.credits.free).toBe(20)
      expect(latestContext?.credits.paid).toBe(70)
    })
  })

  it('convertFile rejects when unauthenticated', async () => {
    renderProvider()

    await waitFor(() => {
      expect(latestContext).toBeTruthy()
    })

    const result = await latestContext!.convertFile({ name: 'a.pdf', url: '/tmp/a.pdf' })
    expect(result).toEqual({ success: false, error: 'User not signed in' })
  })

  it('convertFile calls cloud.convert using path when authenticated', async () => {
    vi.mocked(window.api.auth.getAuthState).mockResolvedValueOnce({
      success: true,
      data: {
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 1,
          email: 'u@example.com',
          name: 'User',
          avatar_url: null,
        },
        deviceFlowStatus: 'idle',
        userCode: null,
        verificationUrl: null,
        error: null,
      },
    })
    vi.mocked(window.api.cloud.convert).mockResolvedValueOnce({ success: true, data: { task_id: 'task-1' } })

    renderProvider()

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true)
    })

    await latestContext!.convertFile({ name: 'a.pdf', url: '/tmp/a.pdf' }, 'pro', '1-2')

    expect(window.api.cloud.convert).toHaveBeenCalledWith({
      name: 'a.pdf',
      model: 'pro',
      page_range: '1-2',
      path: '/tmp/a.pdf',
    })
  })

  it('convertFile uses originFileObj.arrayBuffer branch', async () => {
    setAuthenticatedState()
    vi.mocked(window.api.cloud.convert).mockResolvedValueOnce({ success: true })

    const fakeFile = {
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer),
    } as unknown as File

    renderProvider()

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true)
    })

    await latestContext!.convertFile({ name: 'a.pdf', originFileObj: fakeFile })

    expect(window.api.cloud.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a.pdf',
        content: expect.any(ArrayBuffer),
      }),
    )
  })

  it('maps checkout and history responses', async () => {
    setAuthenticatedState()

    vi.mocked(window.api.cloud.createCheckout).mockResolvedValueOnce({
      success: true,
      data: {
        checkout_url: 'https://checkout',
        session_id: 's1',
        amount_usd: 10,
        credits_to_add: 16000,
      },
    })

    vi.mocked(window.api.cloud.getCheckoutStatus).mockResolvedValueOnce({
      success: true,
      data: {
        session_id: 's1',
        order_id: 'o1',
        status: 'completed',
        provider_status: 'completed',
        is_final: true,
        changed: true,
        amount_usd: 10,
        credits_added: 16000,
        created_at: '2026-03-03T00:00:00.000Z',
      },
    })

    vi.mocked(window.api.cloud.getCreditHistory).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 1,
          amount: 10,
          type: 'topup',
          type_name: 'Top up',
          description: 'x',
          created_at: '2026-03-03T00:00:00.000Z',
          task_id: 't1',
          balance_after: 100,
          bonus_amount: 20,
          paid_amount: 80,
          file_name: 'a.pdf',
        },
      ],
      pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
    })

    vi.mocked(window.api.cloud.getPaymentHistory).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 1,
          amount_usd: 10,
          credits_added: 16000,
          status: 'completed',
          provider_status: 'completed',
          created_at: '2026-03-03T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 },
    })

    renderProvider()

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true)
    })

    const checkout = await latestContext!.createCheckout(10)
    const status = await latestContext!.getCheckoutStatus('s1', 5)
    const creditHistory = await latestContext!.getCreditHistory(1, 10)
    const paymentHistory = await latestContext!.getPaymentHistory(1, 10)

    expect(checkout).toEqual({
      success: true,
      data: {
        checkoutUrl: 'https://checkout',
        sessionId: 's1',
        amountUsd: 10,
        creditsToAdd: 16000,
      },
    })

    expect(status.success).toBe(true)
    expect(status.data?.sessionId).toBe('s1')
    expect(creditHistory.data?.[0].typeName).toBe('Top up')
    expect(paymentHistory.data?.[0].amountUsd).toBe(10)
  })

  it('connects SSE when authenticated and resets/disconnects on unauthenticated/unmount', async () => {
    setAuthenticatedState()

    const { unmount } = renderProvider()

    await waitFor(() => {
      expect(window.api.cloud.sseConnect).toHaveBeenCalled()
    })

    authStateListener?.({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      deviceFlowStatus: 'idle',
      userCode: null,
      verificationUrl: null,
      error: null,
    })

    await waitFor(() => {
      expect(window.api.cloud.sseResetAndDisconnect).toHaveBeenCalled()
    })

    unmount()
    expect(window.api.cloud.sseDisconnect).toHaveBeenCalled()
  })

  it('refreshes credits on payment callback when authenticated', async () => {
    setAuthenticatedState()

    renderProvider()

    await waitFor(() => {
      expect(window.api.cloud.getCredits).toHaveBeenCalledTimes(1)
    })

    paymentListener?.({ status: 'completed' })

    await waitFor(() => {
      expect(window.api.cloud.getCredits).toHaveBeenCalledTimes(2)
    })
  })

  it('handles convertFile invalid data/cloud api missing/errors', async () => {
    setAuthenticatedState()
    const originalCloud = window.api.cloud
    renderProvider()

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true)
    })

    const invalidData = await latestContext!.convertFile({ name: 'x.pdf' })
    expect(invalidData).toEqual({ success: false, error: 'Invalid file data' })

    ;(window.api as any).cloud = undefined
    const noCloudApi = await latestContext!.convertFile({ name: 'x.pdf', url: '/tmp/x.pdf' })
    expect(noCloudApi).toEqual({ success: false, error: 'Cloud API not available' })

    ;(window.api as any).cloud = {
      ...originalCloud,
      convert: vi.fn().mockRejectedValueOnce(new Error('convert boom')),
    }
    const convertError = await latestContext!.convertFile({ name: 'x.pdf', url: '/tmp/x.pdf' })
    expect(convertError).toEqual({ success: false, error: 'convert boom' })
    ;(window.api as any).cloud = originalCloud
  })

  it('wraps getTasks/getTaskById/getTaskPages and task actions', async () => {
    setAuthenticatedState()
    vi.mocked(window.api.cloud.getTasks).mockResolvedValueOnce({ success: true, data: [] })
    vi.mocked(window.api.cloud.getTaskById).mockResolvedValueOnce({ success: true, data: { id: 't1' } as any })
    vi.mocked(window.api.cloud.getTaskPages).mockResolvedValueOnce({ success: true, data: [] })
    vi.mocked(window.api.cloud.cancelTask).mockResolvedValueOnce({ success: true })
    vi.mocked(window.api.cloud.retryTask).mockResolvedValueOnce({ success: true })
    vi.mocked(window.api.cloud.deleteTask).mockResolvedValueOnce({ success: true })
    vi.mocked(window.api.cloud.retryPage).mockResolvedValueOnce({ success: true })
    vi.mocked(window.api.cloud.getTaskResult).mockResolvedValueOnce({ success: true, data: { markdown: '' } as any })
    vi.mocked(window.api.cloud.downloadPdf).mockResolvedValueOnce({ success: true })

    renderProvider()
    await waitFor(() => expect(latestContext?.isAuthenticated).toBe(true))

    await latestContext!.getTasks(2, 5)
    await latestContext!.getTaskById('t1')
    await latestContext!.getTaskPages('t1', 1, 2)
    await latestContext!.cancelTask('t1')
    await latestContext!.retryTask('t1')
    await latestContext!.deleteTask('t1')
    await latestContext!.retryPage('t1', 1)
    await latestContext!.getTaskResult('t1')
    await latestContext!.downloadResult('t1')

    expect(window.api.cloud.getTasks).toHaveBeenCalledWith({ page: 2, pageSize: 5 })
    expect(window.api.cloud.getTaskById).toHaveBeenCalledWith('t1')
    expect(window.api.cloud.getTaskPages).toHaveBeenCalledWith({ taskId: 't1', page: 1, pageSize: 2 })
    expect(window.api.cloud.cancelTask).toHaveBeenCalledWith('t1')
    expect(window.api.cloud.retryTask).toHaveBeenCalledWith('t1')
    expect(window.api.cloud.deleteTask).toHaveBeenCalledWith('t1')
    expect(window.api.cloud.retryPage).toHaveBeenCalledWith({ taskId: 't1', pageNumber: 1 })
    expect(window.api.cloud.getTaskResult).toHaveBeenCalledWith('t1')
    expect(window.api.cloud.downloadPdf).toHaveBeenCalledWith('t1')
  })

  it('returns unauthenticated error for protected methods', async () => {
    renderProvider()
    await waitFor(() => expect(latestContext).toBeTruthy())

    await expect(latestContext!.getTasks()).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.getTaskById('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.getTaskPages('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.cancelTask('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.retryTask('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.deleteTask('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.retryPage('x', 1)).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.getTaskResult('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.downloadResult('x')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.createCheckout(10)).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.getCheckoutStatus('s1')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.reconcileCheckout('s1')).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.getCreditHistory()).resolves.toEqual({ success: false, error: 'User not signed in' })
    await expect(latestContext!.getPaymentHistory()).resolves.toEqual({ success: false, error: 'User not signed in' })
  })

  it('handles checkout API unavailable and failed responses', async () => {
    setAuthenticatedState()
    const originalCloud = window.api.cloud
    renderProvider()

    await waitFor(() => expect(latestContext?.isAuthenticated).toBe(true))

    ;(window.api as any).cloud = undefined

    await expect(latestContext!.createCheckout(10)).resolves.toEqual({ success: false, error: 'Cloud API not available' })
    await expect(latestContext!.getCheckoutStatus('s1')).resolves.toEqual({ success: false, error: 'Cloud API not available' })
    await expect(latestContext!.reconcileCheckout('s1')).resolves.toEqual({ success: false, error: 'Cloud API not available' })
    await expect(latestContext!.getCreditHistory()).resolves.toEqual({ success: false, error: 'Cloud API not available' })
    await expect(latestContext!.getPaymentHistory()).resolves.toEqual({ success: false, error: 'Cloud API not available' })
    ;(window.api as any).cloud = originalCloud
  })

  it('maps checkout failures and action exceptions', async () => {
    setAuthenticatedState()
    ;(window.api as any).cloud = {
      ...window.api.cloud,
    }
    vi.mocked(window.api.cloud.createCheckout).mockResolvedValueOnce({ success: false, error: 'checkout fail' })
    vi.mocked(window.api.cloud.getCheckoutStatus).mockResolvedValueOnce({ success: false, error: 'status fail' })
    vi.mocked(window.api.cloud.reconcileCheckout).mockResolvedValueOnce({ success: false, error: 'reconcile fail' })
    vi.mocked(window.api.cloud.getCreditHistory).mockResolvedValueOnce({ success: false, error: 'history fail' })
    vi.mocked(window.api.cloud.getPaymentHistory).mockResolvedValueOnce({ success: false, error: 'payment fail' })
    vi.mocked(window.api.cloud.getTaskById).mockRejectedValueOnce(new Error('getTaskById boom'))

    renderProvider()
    await waitFor(() => expect(latestContext?.isAuthenticated).toBe(true))

    await expect(latestContext!.createCheckout(20)).resolves.toEqual({ success: false, error: 'checkout fail' })
    await expect(latestContext!.getCheckoutStatus('s1')).resolves.toEqual({ success: false, error: 'status fail' })
    await expect(latestContext!.reconcileCheckout('s1')).resolves.toEqual({ success: false, error: 'reconcile fail' })
    await expect(latestContext!.getCreditHistory()).resolves.toEqual({ success: false, error: 'history fail' })
    await expect(latestContext!.getPaymentHistory()).resolves.toEqual({ success: false, error: 'payment fail' })
    await expect(latestContext!.getTaskById('x')).resolves.toEqual({ success: false, error: 'getTaskById boom' })
  })
})
