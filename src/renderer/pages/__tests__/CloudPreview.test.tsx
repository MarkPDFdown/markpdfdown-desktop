import { App } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CloudPreview from '../CloudPreview'
import { CloudContext, type CloudContextType } from '../../contexts/CloudContextDefinition'

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, params?: any) => {
      const dict: Record<string, string> = {
        back: 'Back',
        fetch_task_failed: 'Fetch task failed',
        fetch_pages_failed: 'Fetch pages failed',
        download_md: 'Download MD',
        download_success: 'Download success',
        download_failed: 'Download failed',
        confirm_cancel: 'Confirm cancel',
        confirm_cancel_content: 'Cancel this task?',
        cancel_success: 'Cancel success',
        cancel_failed: 'Cancel failed',
        confirm_retry: 'Confirm retry',
        confirm_retry_content: 'Retry this task?',
        retry_success: 'Retry success',
        retry_failed: 'Retry failed',
        confirm_retry_failed: 'Confirm retry failed pages',
        confirm_retry_failed_content: 'Retry failed pages?',
        retry_failed_pages: 'Retry Failed Pages',
        retry_failed_success: `Retried ${params?.count ?? 0}`,
        page_retry_success: 'Page retried',
        page_retry_failed: 'Page retry failed',
        confirm_delete: 'Confirm delete',
        confirm_delete_content: 'Delete this task?',
        delete_success: 'Delete success',
        delete_failed: 'Delete failed',
        page_status: 'Status',
        'page_status.pending': 'Pending',
        'page_status.processing': 'Processing',
        'page_status.completed': 'Completed',
        'page_status.failed': 'Failed',
        regenerate: 'Regenerate',
        regenerate_tooltip: 'Regenerate this page',
        no_page_data: 'No page data',
        page_label: `Page ${params?.page}/${params?.total}`,
        more_actions: 'More Actions',
        retry_all: 'Retry All',
        cancel_task: 'Cancel Task',
        delete_task: 'Delete Task',
      }
      if (ns === 'common') {
        if (key === 'common.confirm') return 'Confirm'
        if (key === 'common.cancel') return 'Cancel'
        if (key === 'common.pages') return `${params?.count ?? 0} pages`
      }
      return dict[key] || key
    },
    i18n: { changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../components/MarkdownPreview', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-content">{content}</div>,
}))

type EventCb = (event: any) => void
let cloudEventCb: EventCb | undefined

const buildContextValue = (overrides: Partial<CloudContextType> = {}): CloudContextType => ({
  user: {
    id: 1,
    email: 'u@example.com',
    name: 'User',
    avatarUrl: null,
    isLoaded: true,
    isSignedIn: true,
  },
  credits: {
    total: 1,
    free: 1,
    paid: 0,
    dailyLimit: 200,
    usedToday: 0,
    bonusBalance: 1,
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
  convertFile: vi.fn().mockResolvedValue({ success: false, error: 'n/a' }),
  getTasks: vi.fn().mockResolvedValue({ success: true, data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
  getTaskById: vi.fn().mockResolvedValue({
    success: true,
    data: {
      id: 'task-1',
      file_type: 'pdf',
      file_name: 'demo.pdf',
      status: 8,
      status_name: 'PARTIAL_FAILED',
      page_count: 2,
      pages_completed: 1,
      pages_failed: 1,
      pdf_url: '/demo.pdf',
      credits_estimated: 10,
      credits_consumed: 5,
      created_at: '2026-03-03T00:00:00.000Z',
      model_tier: 'lite',
    },
  }),
  getTaskPages: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        page: 1,
        status: 3,
        status_name: 'FAILED',
        markdown: 'page-1',
        width_mm: 210,
        height_mm: 297,
        image_url: '/api/image/1',
      },
      {
        page: 2,
        status: 2,
        status_name: 'COMPLETED',
        markdown: 'page-2',
        width_mm: 210,
        height_mm: 297,
        image_url: 'https://cdn.example.com/p2.png',
      },
    ],
    pagination: { page: 1, page_size: 2, total: 2, total_pages: 1 },
  }),
  cancelTask: vi.fn().mockResolvedValue({ success: true }),
  retryTask: vi.fn().mockResolvedValue({ success: true, data: { task_id: 'task-2' } }),
  deleteTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1', message: 'deleted' } }),
  retryPage: vi.fn().mockResolvedValue({ success: true }),
  getTaskResult: vi.fn().mockResolvedValue({ success: true, data: { markdown: '# merged', pages: [], metadata: { model_tier: 'lite', file_type: 'pdf', page_count: 2 }, credits: { consumed: 5 } } }),
  downloadResult: vi.fn().mockResolvedValue({ success: true }),
  createCheckout: vi.fn().mockResolvedValue({ success: false, error: 'n/a' }),
  getCheckoutStatus: vi.fn().mockResolvedValue({ success: false, error: 'n/a' }),
  reconcileCheckout: vi.fn().mockResolvedValue({ success: false, error: 'n/a' }),
  getCreditHistory: vi.fn().mockResolvedValue({ success: true, data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
  getPaymentHistory: vi.fn().mockResolvedValue({ success: true, data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
  ...overrides,
})

const renderPage = (contextValue: CloudContextType) =>
  render(
    <MemoryRouter initialEntries={['/list/cloud-preview/task-1']}>
      <Routes>
        <Route
          path="/list/cloud-preview/:id"
          element={
            <App>
              <CloudContext.Provider value={contextValue}>
                <CloudPreview />
              </CloudContext.Provider>
            </App>
          }
        />
        <Route path="/list" element={<div data-testid="list-page">List page</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('CloudPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cloudEventCb = undefined

    vi.mocked(window.api.events.onCloudTaskEvent).mockImplementation((cb: any) => {
      cloudEventCb = cb
      return () => {
        cloudEventCb = undefined
      }
    })

    vi.mocked(window.api.cloud.getPageImage).mockResolvedValue({
      success: true,
      data: { dataUrl: 'data:image/png;base64,abcd' },
    })

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    vi.spyOn(App, 'useApp').mockReturnValue({
      message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
        loading: vi.fn(),
        open: vi.fn(),
        destroy: vi.fn(),
      } as any,
      modal: {
        confirm: ({ onOk }: any) => onOk?.(),
      } as any,
      notification: {} as any,
    } as any)
  })

  it('fetches task/pages and renders markdown', async () => {
    const ctx = buildContextValue()
    renderPage(ctx)

    await waitFor(() => {
      expect(ctx.getTaskById).toHaveBeenCalledWith('task-1')
      expect(ctx.getTaskPages).toHaveBeenCalledWith('task-1', 1, 200)
    })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('page-1')
    })

    expect(window.api.cloud.getPageImage).toHaveBeenCalledWith({ taskId: 'task-1', pageNumber: 1 })
  })

  it('navigates back to list when getTaskById fails', async () => {
    const ctx = buildContextValue({
      getTaskById: vi.fn().mockResolvedValue({ success: false, error: 'missing' }),
    })

    renderPage(ctx)

    await waitFor(() => {
      expect(screen.getByTestId('list-page')).toBeInTheDocument()
    })
  })

  it('uses direct image URL for presigned links', async () => {
    const ctx = buildContextValue({
      getTaskPages: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            page: 1,
            status: 2,
            status_name: 'COMPLETED',
            markdown: 'page-1',
            width_mm: 210,
            height_mm: 297,
            image_url: 'https://cdn.example.com/p1.png',
          },
        ],
      }),
    })

    renderPage(ctx)

    await waitFor(() => {
      const img = document.querySelector('img') as HTMLImageElement
      expect(img).toBeInTheDocument()
      expect(img.src).toContain('https://cdn.example.com/p1.png')
    })

    expect(window.api.cloud.getPageImage).not.toHaveBeenCalled()
  })

  it('handles page retry action', async () => {
    const ctx = buildContextValue()
    renderPage(ctx)

    await waitFor(() => {
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('page-1')
    })

    const retryBtn =
      screen.queryByRole('button', { name: /regenerate/i }) ||
      screen.queryByRole('button', { name: /retry failed pages/i })
    expect(retryBtn).toBeTruthy()
    fireEvent.click(retryBtn as HTMLElement)

    await waitFor(() => {
      expect(ctx.retryPage).toHaveBeenCalledWith('task-1', 1)
    })
  })

  it('handles retry failed pages action from menu', async () => {
    const ctx = buildContextValue()
    renderPage(ctx)

    await waitFor(() => {
      expect(screen.getByText('Retry Failed Pages')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Retry Failed Pages'))

    await waitFor(() => {
      expect(ctx.retryPage).toHaveBeenCalledWith('task-1', 1)
    })
  })

  it('handles download markdown action', async () => {
    const ctx = buildContextValue({
      getTaskById: vi.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'task-1',
          file_type: 'pdf',
          file_name: 'done.pdf',
          status: 6,
          status_name: 'COMPLETED',
          page_count: 1,
          pages_completed: 1,
          pages_failed: 0,
          pdf_url: '/done.pdf',
          credits_estimated: 5,
          credits_consumed: 5,
          created_at: '2026-03-03T00:00:00.000Z',
        },
      }),
      getTaskPages: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            page: 1,
            status: 2,
            status_name: 'COMPLETED',
            markdown: 'one',
            width_mm: 210,
            height_mm: 297,
            image_url: 'https://cdn.example.com/1.png',
          },
        ],
      }),
    })

    renderPage(ctx)

    await waitFor(() => {
      expect(screen.getByText('Download MD')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Download MD'))

    await waitFor(() => {
      expect(ctx.getTaskResult).toHaveBeenCalledWith('task-1')
      expect(URL.createObjectURL).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalled()
    })
  })

  it('applies SSE updates for page and task status', async () => {
    const ctx = buildContextValue()
    renderPage(ctx)

    await waitFor(() => {
      expect(window.api.events.onCloudTaskEvent).toHaveBeenCalled()
    })

    cloudEventCb?.({ type: 'page_started', data: { task_id: 'task-1', page: 1 } })
    cloudEventCb?.({ type: 'page_completed', data: { task_id: 'task-1', page: 1, markdown: 'done-markdown' } })
    cloudEventCb?.({ type: 'completed', data: { task_id: 'task-1', status: 6, pages_completed: 2, pages_failed: 0 } })

    await waitFor(() => {
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('done-markdown')
    })
  })

  it('applies SSE failure/cancel/pdf_ready transitions', async () => {
    const ctx = buildContextValue()
    renderPage(ctx)

    await waitFor(() => {
      expect(window.api.events.onCloudTaskEvent).toHaveBeenCalled()
    })

    cloudEventCb?.({ type: 'page_failed', data: { task_id: 'task-1', page: 1 } })
    cloudEventCb?.({ type: 'pdf_ready', data: { task_id: 'task-1', page_count: 8 } })
    cloudEventCb?.({ type: 'error', data: { task_id: 'task-1' } })
    cloudEventCb?.({ type: 'cancelled', data: { task_id: 'task-1' } })

    await waitFor(() => {
      expect(screen.getByText(/8 pages/)).toBeInTheDocument()
    })
  })
})
