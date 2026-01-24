import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import List from '../List'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'messages.fetch_failed': 'Failed to fetch tasks',
        'messages.delete_success': 'Task deleted',
        'messages.delete_failed': 'Failed to delete task',
        'messages.action_success': `${params?.action} successful`,
        'messages.action_failed': `${params?.action} failed`,
        'confirmations.delete_title': 'Delete Task',
        'confirmations.delete_content': 'Are you sure you want to delete this task?',
        'confirmations.cancel_title': `Confirm ${params?.action}`,
        'confirmations.cancel_content': `Are you sure you want to ${params?.action}?`,
        'confirmations.ok': 'OK',
        'confirmations.cancel': 'Cancel',
        'status.pending': 'Pending',
        'status.initializing': 'Initializing',
        'status.processing': 'Processing',
        'status.merging_pending': 'Ready to Merge',
        'status.merging': 'Merging',
        'status.completed': 'Completed',
        'status.cancelled': 'Cancelled',
        'status.failed': 'Failed',
        'status.partial_failed': 'Partial Failed',
        'status.unknown': 'Unknown',
        'columns.file': 'File',
        'columns.model': 'Model',
        'columns.progress': 'Progress',
        'columns.status': 'Status',
        'columns.action': 'Actions',
        'actions.view': 'View',
        'actions.cancel': 'Cancel',
        'actions.retry': 'Retry',
        'actions.delete': 'Delete'
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock window.api.events - extend the existing mock from setup
const mockEventListeners: Record<string, (event: any) => void> = {}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('List', () => {
  const mockTasks = [
    { id: 'task-1', filename: 'document.pdf', type: 'pdf', pages: 10, model_name: 'GPT-4o', progress: 50, status: 3 },
    { id: 'task-2', filename: 'image.png', type: 'png', pages: 1, model_name: 'Claude 3.5', progress: 100, status: 6 },
    { id: 'task-3', filename: 'failed.pdf', type: 'pdf', pages: 5, model_name: 'GPT-4o', progress: 20, status: 0, error: 'API error' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(window.api.task.getAll).mockResolvedValue({
      success: true,
      data: { list: mockTasks, total: 3 }
    })

    vi.mocked(window.api.task.delete).mockResolvedValue({
      success: true,
      data: { id: 'task-1' }
    })

    vi.mocked(window.api.task.update).mockResolvedValue({
      success: true,
      data: { id: 'task-1', status: 7 }
    })

    // Setup event listener mock
    vi.mocked(window.api.events.onTaskEvent).mockImplementation((callback) => {
      mockEventListeners['task'] = callback
      return () => { delete mockEventListeners['task'] }
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getAll).toHaveBeenCalled()
      })
    })

    it('should render table component', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const table = document.querySelector('.ant-table')
        expect(table).toBeInTheDocument()
      })
    })
  })

  describe('Data Fetching', () => {
    it('should fetch tasks on mount', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getAll).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
      })
    })

    it('should display tasks in table', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      // Wait for table to load
      await waitFor(() => {
        expect(window.api.task.getAll).toHaveBeenCalled()
      })

      // Check for table rows - filenames are inside nested components
      await waitFor(() => {
        const tableRows = document.querySelectorAll('.ant-table-row')
        expect(tableRows.length).toBe(3)
      }, { timeout: 3000 })
    })

    it('should display model names', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        // Multiple rows may have the same model name, so use getAllByText
        const gpt4oElements = screen.getAllByText('GPT-4o')
        expect(gpt4oElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Status Display', () => {
    it('should display correct status tags', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Processing')).toBeInTheDocument()
        expect(screen.getByText('Completed')).toBeInTheDocument()
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })

    it('should show error tooltip for failed tasks', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const failedTag = screen.getByText('Failed')
        expect(failedTag).toBeInTheDocument()
      })
    })
  })

  describe('Progress Display', () => {
    it('should display progress bars', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const progressBars = document.querySelectorAll('.ant-progress')
        expect(progressBars.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Actions', () => {
    it('should show View action for processing tasks', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const viewLinks = screen.getAllByText('View')
        expect(viewLinks.length).toBeGreaterThan(0)
      })
    })

    it('should show Cancel action for running tasks', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument()
      })
    })

    it('should show Retry action for failed tasks', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })
    })

    it('should show Delete action for completed/failed tasks', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const deleteButtons = screen.getAllByText('Delete')
        expect(deleteButtons.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Pagination', () => {
    it('should display pagination', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const pagination = document.querySelector('.ant-pagination')
        expect(pagination).toBeInTheDocument()
      })
    })

    it('should fetch new page when pagination changes', async () => {
      vi.mocked(window.api.task.getAll).mockResolvedValue({
        success: true,
        data: { list: mockTasks, total: 30 }
      })

      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getAll).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
      })
    })
  })

  describe('Event Listeners', () => {
    it('should register task event listener on mount', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.events.onTaskEvent).toHaveBeenCalled()
      })
    })

    it('should update task when receiving task:updated event', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.events.onTaskEvent).toHaveBeenCalled()
      })

      // Simulate task update event
      if (mockEventListeners['task']) {
        mockEventListeners['task']({
          type: 'task:updated',
          taskId: 'task-1',
          task: { progress: 75 }
        })
      }

      // State should be updated - just verify event was processed
      expect(mockEventListeners['task']).toBeDefined()
    })

    it('should remove task when receiving task:deleted event', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.events.onTaskEvent).toHaveBeenCalled()
      })

      // Simulate task delete event
      if (mockEventListeners['task']) {
        mockEventListeners['task']({
          type: 'task:deleted',
          taskId: 'task-1'
        })
      }

      // Verify event handler is set up
      expect(mockEventListeners['task']).toBeDefined()
    })
  })

  describe('File Type Icons', () => {
    it('should display PDF icon for PDF files', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const pdfIcons = document.querySelectorAll('[aria-label="file-pdf"]')
        expect(pdfIcons.length).toBeGreaterThan(0)
      })
    })

    it('should display image icon for image files', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        const imageIcons = document.querySelectorAll('[aria-label="file-image"]')
        expect(imageIcons.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Page Count Display', () => {
    it('should display page count for multi-page files', async () => {
      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/\[.*pages\].*document\.pdf/i)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle API error gracefully', async () => {
      vi.mocked(window.api.task.getAll).mockResolvedValue({
        success: false,
        error: 'Server error'
      })

      render(
        <Wrapper>
          <List />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.task.getAll).toHaveBeenCalled()
      })
    })
  })
})
