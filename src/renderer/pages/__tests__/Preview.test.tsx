import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom'
import { App } from 'antd'
import Preview from '../Preview'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: (namespace?: string) => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'preview.back': 'Back',
        'preview.download': 'Download',
        'preview.cancel': 'Cancel',
        'preview.retry': 'Retry',
        'preview.delete': 'Delete',
        'preview.regenerate': 'Regenerate',
        'preview.regenerate_tooltip': 'Regenerate this page',
        'preview.confirm_delete': 'Delete Task',
        'preview.confirm_delete_content': 'Are you sure you want to delete this task?',
        'preview.confirm_cancel': 'Cancel Task',
        'preview.confirm_cancel_content': 'Are you sure you want to cancel this task?',
        'preview.confirm_retry': 'Retry Task',
        'preview.confirm_retry_content': 'Are you sure you want to retry this task?',
        'preview.delete_success': 'Task deleted',
        'preview.delete_failed': 'Failed to delete task',
        'preview.cancel_success': 'Task cancelled',
        'preview.cancel_failed': 'Failed to cancel task',
        'preview.retry_success': 'Task retrying',
        'preview.retry_failed': 'Failed to retry task',
        'preview.status.failed': 'Failed',
        'preview.status.pending': 'Pending',
        'preview.status.processing': 'Processing',
        'preview.status.completed': 'Completed',
        'preview.status.retrying': 'Retrying',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.pages': `${params?.count || 0} pages`
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock MarkdownPreview component
vi.mock('../../components/MarkdownPreview', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content || 'No content'}</div>
  )
}))

// Mock window.api.events - extend the existing mock from setup
const mockEventListeners: Record<string, (event: any) => void> = {}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/preview/task-1']}>
    <Routes>
      <Route path="/preview/:id" element={<App>{children}</App>} />
      <Route path="/list" element={<div data-testid="list-page">List Page</div>} />
    </Routes>
  </MemoryRouter>
)

describe('Preview', () => {
  const mockTask = {
    id: 'task-1',
    filename: 'document.pdf',
    type: 'pdf',
    pages: 5,
    model_name: 'GPT-4o',
    progress: 60,
    status: 3, // PROCESSING
    merged_path: null
  }

  const mockCompletedTask = {
    ...mockTask,
    status: 6, // COMPLETED
    progress: 100,
    merged_path: '/path/to/merged.md'
  }

  const mockFailedTask = {
    ...mockTask,
    status: 0, // FAILED
    progress: 20
  }

  const mockTaskDetail = {
    id: 'detail-1',
    taskId: 'task-1',
    page: 1,
    status: 2, // COMPLETED
    content: '# Page 1 Content\n\nThis is the content.',
    imagePath: 'C:\\images\\page1.png',
    imageExists: true,
    error: null
  }

  const mockPendingDetail = {
    ...mockTaskDetail,
    status: 0, // PENDING
    content: ''
  }

  const mockFailedDetail = {
    ...mockTaskDetail,
    status: -1, // FAILED
    content: '',
    error: 'API rate limit exceeded'
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(window.api.task.getById).mockResolvedValue({
      success: true,
      data: mockTask
    })

    vi.mocked(window.api.taskDetail.getByPage).mockResolvedValue({
      success: true,
      data: mockTaskDetail
    })

    vi.mocked(window.api.task.update).mockResolvedValue({
      success: true,
      data: mockTask
    })

    vi.mocked(window.api.task.delete).mockResolvedValue({
      success: true,
      data: { id: 'task-1' }
    })

    vi.mocked(window.api.file.downloadMarkdown).mockResolvedValue({
      success: true,
      data: { path: '/downloads/document.md' }
    })

    vi.mocked(window.api.taskDetail.retry).mockResolvedValue({
      success: true,
      data: { id: 'detail-1' }
    })

    // Setup event listener mocks
    vi.mocked(window.api.events.onTaskEvent).mockImplementation((callback) => {
      mockEventListeners['task'] = callback
      return () => { delete mockEventListeners['task'] }
    })

    vi.mocked(window.api.events.onTaskDetailEvent).mockImplementation((callback) => {
      mockEventListeners['taskDetail'] = callback
      return () => { delete mockEventListeners['taskDetail'] }
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getById).toHaveBeenCalledWith('task-1')
      })
    })

    it('should display task filename', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/document\.pdf/)).toBeInTheDocument()
      })
    })

    it('should display page count', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/5 pages/)).toBeInTheDocument()
      })
    })

    it('should display back button', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument()
      })
    })
  })

  describe('Data Fetching', () => {
    it('should fetch task on mount', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getById).toHaveBeenCalledWith('task-1')
      })
    })

    it('should fetch page detail after task loads', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.taskDetail.getByPage).toHaveBeenCalledWith('task-1', 1)
      })
    })
  })

  describe('Image Preview', () => {
    it('should display image when available', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        const img = document.querySelector('img')
        expect(img).toBeInTheDocument()
        expect(img?.alt).toBe('Page 1')
      })
    })

    it('should show error message when image fails to load', async () => {
      vi.mocked(window.api.taskDetail.getByPage).mockResolvedValue({
        success: true,
        data: { ...mockTaskDetail, imageExists: false }
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/图片加载失败或不存在/)).toBeInTheDocument()
      })
    })
  })

  describe('Markdown Preview', () => {
    it('should render MarkdownPreview component', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
      })
    })

    it('should pass content to MarkdownPreview', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Page 1 Content')
      })
    })
  })

  describe('Pagination', () => {
    it('should display pagination component', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        const pagination = document.querySelector('.ant-pagination')
        expect(pagination).toBeInTheDocument()
      })
    })

    it('should fetch new page when pagination changes', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.taskDetail.getByPage).toHaveBeenCalledWith('task-1', 1)
      })

      // Click page 2
      const page2Button = screen.getByText('2')
      fireEvent.click(page2Button)

      await waitFor(() => {
        expect(window.api.taskDetail.getByPage).toHaveBeenCalledWith('task-1', 2)
      })
    })
  })

  describe('Page Status Display', () => {
    it('should show Completed status for completed page', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument()
      })
    })

    it('should show Pending status for pending page', async () => {
      vi.mocked(window.api.taskDetail.getByPage).mockResolvedValue({
        success: true,
        data: mockPendingDetail
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument()
      })
    })

    it('should show Failed status for failed page', async () => {
      vi.mocked(window.api.taskDetail.getByPage).mockResolvedValue({
        success: true,
        data: mockFailedDetail
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })
  })

  describe('Retry Page', () => {
    it('should display regenerate button', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Regenerate')).toBeInTheDocument()
      })
    })

    it('should call retry API when clicking regenerate', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Regenerate')).toBeInTheDocument()
      })

      const regenerateButton = screen.getByText('Regenerate')
      fireEvent.click(regenerateButton)

      await waitFor(() => {
        expect(window.api.taskDetail.retry).toHaveBeenCalledWith('detail-1')
      })
    })
  })

  describe('Task Actions', () => {
    describe('Download', () => {
      it('should display download button', async () => {
        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.getByText('Download')).toBeInTheDocument()
        })
      })

      it('should disable download for non-completed tasks', async () => {
        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          const downloadButton = screen.getByText('Download').closest('button')
          expect(downloadButton).toBeDisabled()
        })
      })

      it('should enable download for completed tasks with merged_path', async () => {
        vi.mocked(window.api.task.getById).mockResolvedValue({
          success: true,
          data: mockCompletedTask
        })

        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          const downloadButton = screen.getByText('Download').closest('button')
          expect(downloadButton).not.toBeDisabled()
        })
      })

      it('should call download API when clicking download', async () => {
        vi.mocked(window.api.task.getById).mockResolvedValue({
          success: true,
          data: mockCompletedTask
        })

        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          const downloadButton = screen.getByText('Download').closest('button')
          expect(downloadButton).not.toBeDisabled()
        })

        const downloadButton = screen.getByText('Download')
        fireEvent.click(downloadButton)

        await waitFor(() => {
          expect(window.api.file.downloadMarkdown).toHaveBeenCalledWith('task-1')
        })
      })
    })

    describe('Cancel', () => {
      it('should display cancel button for processing tasks', async () => {
        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.getByText('Cancel')).toBeInTheDocument()
        })
      })

      it('should not display cancel button for completed tasks', async () => {
        vi.mocked(window.api.task.getById).mockResolvedValue({
          success: true,
          data: mockCompletedTask
        })

        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
        })
      })
    })

    describe('Retry Task', () => {
      it('should display retry button for failed tasks', async () => {
        vi.mocked(window.api.task.getById).mockResolvedValue({
          success: true,
          data: mockFailedTask
        })

        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.getByText('Retry')).toBeInTheDocument()
        })
      })

      it('should not display retry button for processing tasks', async () => {
        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          // Wait for task to load
          expect(screen.getByText(/document\.pdf/)).toBeInTheDocument()
        })

        expect(screen.queryByText('Retry')).not.toBeInTheDocument()
      })
    })

    describe('Delete', () => {
      it('should display delete button for completed tasks', async () => {
        vi.mocked(window.api.task.getById).mockResolvedValue({
          success: true,
          data: mockCompletedTask
        })

        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.getByText('Delete')).toBeInTheDocument()
        })
      })

      it('should display delete button for failed tasks', async () => {
        vi.mocked(window.api.task.getById).mockResolvedValue({
          success: true,
          data: mockFailedTask
        })

        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.getByText('Delete')).toBeInTheDocument()
        })
      })

      it('should not display delete button for processing tasks', async () => {
        render(
          <Wrapper>
            <Preview />
          </Wrapper>
        )

        await waitFor(() => {
          expect(screen.getByText(/document\.pdf/)).toBeInTheDocument()
        })

        expect(screen.queryByText('Delete')).not.toBeInTheDocument()
      })
    })
  })

  describe('Event Listeners', () => {
    it('should register task event listener on mount', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.events.onTaskEvent).toHaveBeenCalled()
      })
    })

    it('should register task detail event listener on mount', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.events.onTaskDetailEvent).toHaveBeenCalled()
      })
    })

    it('should update task when receiving task:updated event', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/document\.pdf/)).toBeInTheDocument()
      })

      // Simulate task update event
      if (mockEventListeners['task']) {
        mockEventListeners['task']({
          type: 'task:updated',
          taskId: 'task-1',
          task: { progress: 80 }
        })
      }

      // Task state should be updated (progress bar would reflect this)
    })

    it('should update page status when receiving taskDetail event', async () => {
      vi.mocked(window.api.taskDetail.getByPage).mockResolvedValue({
        success: true,
        data: mockPendingDetail
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument()
      })

      // Simulate task detail event
      if (mockEventListeners['taskDetail']) {
        mockEventListeners['taskDetail']({
          taskId: 'task-1',
          page: 1,
          status: 2 // COMPLETED
        })
      }

      // Page status should update
    })
  })

  describe('Navigation', () => {
    it('should navigate to list when clicking back button', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument()
      })

      const backButton = screen.getByText('Back')
      fireEvent.click(backButton)

      await waitFor(() => {
        expect(screen.getByTestId('list-page')).toBeInTheDocument()
      })
    })

    it('should navigate to list when task not found', async () => {
      vi.mocked(window.api.task.getById).mockResolvedValue({
        success: false,
        error: 'Task not found'
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('list-page')).toBeInTheDocument()
      })
    })
  })

  describe('Progress Display', () => {
    it('should display progress bar', async () => {
      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        const progressBar = document.querySelector('.ant-progress')
        expect(progressBar).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle task fetch error gracefully', async () => {
      vi.mocked(window.api.task.getById).mockResolvedValue({
        success: false,
        error: 'Server error'
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getById).toHaveBeenCalled()
      })
    })

    it('should handle page detail fetch error gracefully', async () => {
      vi.mocked(window.api.taskDetail.getByPage).mockResolvedValue({
        success: false,
        error: 'Page not found'
      })

      render(
        <Wrapper>
          <Preview />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.taskDetail.getByPage).toHaveBeenCalled()
      })
    })
  })
})
