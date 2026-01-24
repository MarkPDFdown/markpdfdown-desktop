import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockTaskDetailRepository = {
  findByTaskAndPage: vi.fn(),
  findByTaskId: vi.fn()
}

const mockEventBus = {
  emitTaskEvent: vi.fn()
}

const mockPrisma = {
  $transaction: vi.fn(),
  taskDetail: {
    aggregate: vi.fn(),
    groupBy: vi.fn()
  }
}

const mockFs = {
  existsSync: vi.fn()
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain
}))

vi.mock('fs', () => ({
  default: mockFs
}))

vi.mock('../../../../core/repositories/TaskDetailRepository.js', () => ({
  default: mockTaskDetailRepository
}))

vi.mock('../../../../core/logic/split/ImagePathUtil.js', () => ({
  ImagePathUtil: {
    getPath: vi.fn((taskId: string, page: number) => `/uploads/${taskId}/split/page-${page}.png`)
  }
}))

vi.mock('../../../../core/events/EventBus.js', () => ({
  eventBus: mockEventBus,
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed'
  }
}))

vi.mock('../../../../core/db/index.js', () => ({
  prisma: mockPrisma
}))

vi.mock('../../../../core/types/TaskStatus.js', () => ({
  TaskStatus: {
    PROCESSING: 3,
    CANCELLED: 7
  }
}))

vi.mock('../../../../core/types/PageStatus.js', () => ({
  PageStatus: {
    FAILED: -1,
    PENDING: 0,
    PROCESSING: 1,
    COMPLETED: 2
  }
}))

vi.mock('../../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    TASK_DETAIL: {
      GET_BY_PAGE: 'taskDetail:getByPage',
      GET_ALL_BY_TASK: 'taskDetail:getAllByTask',
      RETRY: 'taskDetail:retry',
      RETRY_FAILED: 'taskDetail:retryFailed',
      GET_COST_STATS: 'taskDetail:getCostStats'
    }
  }
}))

describe('TaskDetail Handler', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    const { registerTaskDetailHandlers } = await import('../taskDetail.handler.js')
    registerTaskDetailHandlers()
  })

  describe('taskDetail:getByPage', () => {
    it('should return page detail with image info', async () => {
      const mockDetail = {
        id: 1,
        task: 'task-1',
        page: 5,
        status: 2,
        content: '# Page 5'
      }
      mockTaskDetailRepository.findByTaskAndPage.mockResolvedValue(mockDetail)
      mockFs.existsSync.mockReturnValue(true)

      const handler = handlers.get('taskDetail:getByPage')
      const result = await handler!({}, 'task-1', 5)

      expect(result).toEqual({
        success: true,
        data: {
          ...mockDetail,
          imagePath: '/uploads/task-1/split/page-5.png',
          imageExists: true
        }
      })
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('taskDetail:getByPage')
      const result = await handler!({}, '', 1)

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })

    it('should return error when page is invalid', async () => {
      const handler = handlers.get('taskDetail:getByPage')
      const result = await handler!({}, 'task-1', 0)

      expect(result).toEqual({
        success: false,
        error: 'Page number must be greater than 0'
      })
    })

    it('should return error when detail not found', async () => {
      mockTaskDetailRepository.findByTaskAndPage.mockResolvedValue(null)

      const handler = handlers.get('taskDetail:getByPage')
      const result = await handler!({}, 'task-1', 99)

      expect(result).toEqual({
        success: false,
        error: 'Page detail not found'
      })
    })

    it('should indicate when image does not exist', async () => {
      const mockDetail = { id: 1, task: 'task-1', page: 1, status: 0 }
      mockTaskDetailRepository.findByTaskAndPage.mockResolvedValue(mockDetail)
      mockFs.existsSync.mockReturnValue(false)

      const handler = handlers.get('taskDetail:getByPage')
      const result = await handler!({}, 'task-1', 1)

      expect(result.data.imageExists).toBe(false)
    })
  })

  describe('taskDetail:getAllByTask', () => {
    it('should return all task details', async () => {
      const mockDetails = [
        { id: 1, task: 'task-1', page: 1 },
        { id: 2, task: 'task-1', page: 2 }
      ]
      mockTaskDetailRepository.findByTaskId.mockResolvedValue(mockDetails)

      const handler = handlers.get('taskDetail:getAllByTask')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: true,
        data: mockDetails
      })
      expect(mockTaskDetailRepository.findByTaskId).toHaveBeenCalledWith('task-1')
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('taskDetail:getAllByTask')
      const result = await handler!({}, '')

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })
  })

  describe('taskDetail:retry', () => {
    it('should successfully retry a single page', async () => {
      const mockPage = { id: 1, task: 'task-1', status: -1 } // FAILED
      const mockTask = { id: 'task-1', status: 6, progress: 90, pages: 10 }
      const updatedPage = { ...mockPage, status: 0 } // PENDING
      const updatedTask = { ...mockTask, status: 3 } // PROCESSING

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue(mockPage),
            update: vi.fn().mockResolvedValue(updatedPage)
          },
          task: {
            findUnique: vi.fn().mockResolvedValue(mockTask),
            update: vi.fn().mockResolvedValue(updatedTask)
          }
        }
        return callback(tx)
      })

      const handler = handlers.get('taskDetail:retry')
      const result = await handler!({}, 1)

      expect(result).toEqual({
        success: true,
        data: updatedPage
      })
      expect(mockEventBus.emitTaskEvent).toHaveBeenCalled()
    })

    it('should return error when pageId is missing', async () => {
      const handler = handlers.get('taskDetail:retry')
      const result = await handler!({}, null)

      expect(result).toEqual({
        success: false,
        error: 'Page ID is required'
      })
    })

    it('should only allow retry on FAILED or COMPLETED pages', async () => {
      const mockPage = { id: 1, task: 'task-1', status: 1 } // PROCESSING

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue(mockPage)
          },
          task: {
            findUnique: vi.fn()
          }
        }
        return callback(tx)
      })

      const handler = handlers.get('taskDetail:retry')
      const result = await handler!({}, 1)

      expect(result).toEqual({
        success: false,
        error: 'Can only retry failed or completed pages'
      })
    })

    it('should not allow retry on cancelled tasks', async () => {
      const mockPage = { id: 1, task: 'task-1', status: -1 } // FAILED
      const mockTask = { id: 'task-1', status: 7 } // CANCELLED

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue(mockPage)
          },
          task: {
            findUnique: vi.fn().mockResolvedValue(mockTask)
          }
        }
        return callback(tx)
      })

      const handler = handlers.get('taskDetail:retry')
      const result = await handler!({}, 1)

      expect(result).toEqual({
        success: false,
        error: 'Task is cancelled, cannot retry'
      })
    })
  })

  describe('taskDetail:retryFailed', () => {
    it('should retry all failed pages', async () => {
      const mockTask = { id: 'task-1', status: 6, completed_count: 8, pages: 10 }
      const updatedTask = { ...mockTask, status: 3, failed_count: 0 }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue(mockTask),
            update: vi.fn().mockResolvedValue(updatedTask)
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(2),
            updateMany: vi.fn().mockResolvedValue({ count: 2 })
          }
        }
        return callback(tx)
      })

      const handler = handlers.get('taskDetail:retryFailed')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: true,
        data: { retried: 2 }
      })
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('taskDetail:retryFailed')
      const result = await handler!({}, '')

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })

    it('should return error when no failed pages exist', async () => {
      const mockTask = { id: 'task-1', status: 6 }

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue(mockTask)
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(0)
          }
        }
        return callback(tx)
      })

      const handler = handlers.get('taskDetail:retryFailed')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: false,
        error: 'No failed pages to retry'
      })
    })
  })

  describe('taskDetail:getCostStats', () => {
    it('should return correct statistics', async () => {
      mockPrisma.taskDetail.aggregate.mockResolvedValue({
        _sum: {
          input_tokens: 1000,
          output_tokens: 500,
          conversion_time: 5000
        },
        _avg: {
          conversion_time: 500
        },
        _count: {
          id: 10
        }
      })

      mockPrisma.taskDetail.groupBy.mockResolvedValue([
        { status: 2, _count: { id: 8 }, _sum: { input_tokens: 800, output_tokens: 400 } },
        { status: -1, _count: { id: 2 }, _sum: { input_tokens: 200, output_tokens: 100 } }
      ])

      const handler = handlers.get('taskDetail:getCostStats')
      const result = await handler!({}, 'task-1')

      expect(result.success).toBe(true)
      expect(result.data.total.pages).toBe(10)
      expect(result.data.total.input_tokens).toBe(1000)
      expect(result.data.total.output_tokens).toBe(500)
      expect(result.data.total.total_tokens).toBe(1500)
      expect(result.data.byStatus.completed.count).toBe(8)
      expect(result.data.byStatus.failed.count).toBe(2)
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('taskDetail:getCostStats')
      const result = await handler!({}, '')

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })

    it('should handle empty results', async () => {
      mockPrisma.taskDetail.aggregate.mockResolvedValue({
        _sum: { input_tokens: null, output_tokens: null, conversion_time: null },
        _avg: { conversion_time: null },
        _count: { id: 0 }
      })
      mockPrisma.taskDetail.groupBy.mockResolvedValue([])

      const handler = handlers.get('taskDetail:getCostStats')
      const result = await handler!({}, 'task-1')

      expect(result.data.total.pages).toBe(0)
      expect(result.data.total.input_tokens).toBe(0)
      expect(result.data.total.total_tokens).toBe(0)
    })
  })
})
