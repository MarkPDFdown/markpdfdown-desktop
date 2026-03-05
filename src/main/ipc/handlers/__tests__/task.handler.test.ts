import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before imports
const mockTaskRepository = {
  createTasks: vi.fn(),
  findAll: vi.fn(),
  getTotal: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  remove: vi.fn()
}

const mockFileLogic = {
  deleteTaskFiles: vi.fn()
}

const mockEventBus = {
  emitTaskEvent: vi.fn()
}

const mockPrisma = {
  $transaction: vi.fn(),
  task: {
    count: vi.fn()
  },
  taskDetail: {
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  provider: {
    findUnique: vi.fn(),
  },
  model: {
    findUnique: vi.fn(),
  },
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain
}))

vi.mock('../../../../core/domain/repositories/TaskRepository.js', () => ({
  default: mockTaskRepository
}))

vi.mock('../../../../core/infrastructure/services/FileService.js', () => ({
  default: mockFileLogic
}))

vi.mock('../../../../core/shared/events/EventBus.js', () => ({
  eventBus: mockEventBus,
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_DELETED: 'task:deleted'
  }
}))

vi.mock('../../../../core/infrastructure/db/index.js', () => ({
  prisma: mockPrisma
}))

vi.mock('../../../../shared/types/TaskStatus.js', () => ({
  TaskStatus: {
    CREATED: -1,
    FAILED: 0,
    PENDING: 1,
    SPLITTING: 2,
    PROCESSING: 3,
    READY_TO_MERGE: 4,
    MERGING: 5,
    COMPLETED: 6,
    CANCELLED: 7,
    PARTIAL_FAILED: 8,
  }
}))

vi.mock('../../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    TASK: {
      CREATE: 'task:create',
      GET_ALL: 'task:getAll',
      GET_BY_ID: 'task:getById',
      UPDATE: 'task:update',
      RETRY: 'task:retry',
      DELETE: 'task:delete',
      HAS_RUNNING: 'task:hasRunningTasks'
    }
  }
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123')
}))

describe('Task Handler', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    // Capture all registered handlers
    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    // Import and register handlers
    const { registerTaskHandlers } = await import('../task.handler.js')
    registerTaskHandlers()
  })

  describe('task:create', () => {
    it('should create tasks with generated UUIDs', async () => {
      const inputTasks = [
        { filename: 'test.pdf', model: 'gpt-4o' }
      ]
      const createdTasks = [
        { id: 'test-uuid-123', filename: 'test.pdf', model: 'gpt-4o', progress: 0, status: -1 }
      ]
      mockTaskRepository.createTasks.mockResolvedValue(createdTasks)

      const handler = handlers.get('task:create')
      const result = await handler!({}, inputTasks)

      expect(result).toEqual({
        success: true,
        data: createdTasks
      })
      expect(mockTaskRepository.createTasks).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'test-uuid-123',
          progress: 0,
          status: -1
        })
      ])
    })

    it('should return error when tasks array is empty', async () => {
      const handler = handlers.get('task:create')
      const result = await handler!({}, [])

      expect(result).toEqual({
        success: false,
        error: 'Task list cannot be empty'
      })
    })

    it('should return error when tasks is not an array', async () => {
      const handler = handlers.get('task:create')
      const result = await handler!({}, null)

      expect(result).toEqual({
        success: false,
        error: 'Task list cannot be empty'
      })
    })

    it('should handle database errors', async () => {
      mockTaskRepository.createTasks.mockRejectedValue(new Error('Database error'))

      const handler = handlers.get('task:create')
      const result = await handler!({}, [{ filename: 'test.pdf' }])

      expect(result).toEqual({
        success: false,
        error: 'Database error'
      })
    })
  })

  describe('task:getAll', () => {
    it('should return paginated tasks', async () => {
      const mockTasks = [
        { id: '1', status: 1 },
        { id: '2', status: 2 }
      ]
      mockTaskRepository.findAll.mockResolvedValue(mockTasks)
      mockTaskRepository.getTotal.mockResolvedValue(10)

      const handler = handlers.get('task:getAll')
      const result = await handler!({}, { page: 1, pageSize: 10 })

      expect(result).toEqual({
        success: true,
        data: { list: mockTasks, total: 10 }
      })
      expect(mockTaskRepository.findAll).toHaveBeenCalledWith(1, 10)
    })

    it('should use default pagination parameters', async () => {
      mockTaskRepository.findAll.mockResolvedValue([])
      mockTaskRepository.getTotal.mockResolvedValue(0)

      const handler = handlers.get('task:getAll')
      await handler!({}, {})

      expect(mockTaskRepository.findAll).toHaveBeenCalledWith(1, 10)
    })

    it('should handle null params', async () => {
      mockTaskRepository.findAll.mockResolvedValue([])
      mockTaskRepository.getTotal.mockResolvedValue(0)

      const handler = handlers.get('task:getAll')
      await handler!({}, null)

      expect(mockTaskRepository.findAll).toHaveBeenCalledWith(1, 10)
    })
  })

  describe('task:getById', () => {
    it('should return task by ID', async () => {
      const mockTask = { id: 'task-1', filename: 'test.pdf', status: 1 }
      mockTaskRepository.findById.mockResolvedValue(mockTask)

      const handler = handlers.get('task:getById')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: true,
        data: mockTask
      })
      expect(mockTaskRepository.findById).toHaveBeenCalledWith('task-1')
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('task:getById')
      const result = await handler!({}, '')

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })

    it('should return error when task not found', async () => {
      mockTaskRepository.findById.mockResolvedValue(null)

      const handler = handlers.get('task:getById')
      const result = await handler!({}, 'non-existent')

      expect(result).toEqual({
        success: false,
        error: 'Task not found'
      })
    })
  })

  describe('task:update', () => {
    it('should update task successfully and emit event', async () => {
      const updatedTask = { id: 'task-1', status: 2, progress: 100 }
      mockTaskRepository.update.mockResolvedValue(updatedTask)

      const handler = handlers.get('task:update')
      const result = await handler!({}, 'task-1', { status: 2, progress: 100 })

      expect(result).toEqual({
        success: true,
        data: updatedTask
      })
      expect(mockEventBus.emitTaskEvent).toHaveBeenCalledWith(
        'task:updated',
        expect.objectContaining({
          taskId: 'task-1',
          task: updatedTask
        })
      )
    })

    it('should emit STATUS_CHANGED event when status changes', async () => {
      const updatedTask = { id: 'task-1', status: 3 }
      mockTaskRepository.update.mockResolvedValue(updatedTask)

      const handler = handlers.get('task:update')
      await handler!({}, 'task-1', { status: 3 })

      expect(mockEventBus.emitTaskEvent).toHaveBeenCalledWith(
        'task:status_changed',
        expect.objectContaining({
          taskId: 'task-1',
          task: { status: 3 }
        })
      )
    })

    it('should not emit STATUS_CHANGED when status not in update', async () => {
      mockTaskRepository.update.mockResolvedValue({ id: 'task-1', progress: 50 })

      const handler = handlers.get('task:update')
      await handler!({}, 'task-1', { progress: 50 })

      expect(mockEventBus.emitTaskEvent).toHaveBeenCalledTimes(1) // Only TASK_UPDATED
      expect(mockEventBus.emitTaskEvent).not.toHaveBeenCalledWith(
        'task:status_changed',
        expect.anything()
      )
    })
  })

  describe('task:retry', () => {
    it('should retry task with legacy string payload', async () => {
      const taskUpdate = vi.fn().mockResolvedValue({
        id: 'task-1',
        status: 3,
        provider: 1,
        model: 'gpt-4o',
      })

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 0,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
            update: taskUpdate,
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(2),
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          provider: {
            findUnique: vi.fn(),
          },
          model: {
            findUnique: vi.fn(),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, 'task-1')

      expect(result.success).toBe(true)
      expect(taskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
        })
      )
    })

    it('should retry task with model override', async () => {
      const taskDetailUpdateMany = vi.fn().mockResolvedValue({ count: 3 })
      const taskUpdate = vi.fn().mockResolvedValue({
        id: 'task-1',
        status: 3,
        provider: 2,
        model: 'gpt-4.1',
      })

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 0,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
            update: taskUpdate,
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(3),
            updateMany: taskDetailUpdateMany,
          },
          provider: {
            findUnique: vi.fn().mockResolvedValue({ id: 2, name: 'Anthropic', status: 0 }),
          },
          model: {
            findUnique: vi.fn().mockResolvedValue({ id: 'gpt-4.1', name: 'GPT-4.1', provider: 2 }),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1', providerId: 2, modelId: 'gpt-4.1' })

      expect(result.success).toBe(true)
      expect(taskDetailUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: 'task-1' },
          data: expect.objectContaining({
            provider: 2,
            model: 'gpt-4.1',
          }),
        })
      )
      expect(taskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            provider: 2,
            model: 'gpt-4.1',
            status: 3,
          }),
        })
      )
      expect(mockEventBus.emitTaskEvent).toHaveBeenCalledWith(
        'task:status_changed',
        expect.objectContaining({
          taskId: 'task-1',
          task: { status: 3 },
        })
      )
    })

    it('should set task to pending when task has no details', async () => {
      const taskDetailUpdateMany = vi.fn().mockResolvedValue({ count: 0 })
      const taskUpdate = vi.fn().mockResolvedValue({
        id: 'task-1',
        status: 1,
        provider: 1,
        model: 'gpt-4o',
      })

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 0,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
            update: taskUpdate,
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(0),
            updateMany: taskDetailUpdateMany,
          },
          provider: {
            findUnique: vi.fn(),
          },
          model: {
            findUnique: vi.fn(),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1' })

      expect(result.success).toBe(true)
      expect(taskDetailUpdateMany).not.toHaveBeenCalled()
      expect(taskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 1,
          }),
        })
      )
      expect(mockEventBus.emitTaskEvent).toHaveBeenCalledWith(
        'task:status_changed',
        expect.objectContaining({
          taskId: 'task-1',
          task: { status: 1 },
        })
      )
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: '' })

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })

    it('should return error when model override params are incomplete', async () => {
      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1', providerId: 1 })

      expect(result).toEqual({
        success: false,
        error: 'providerId and modelId must be provided together'
      })
    })

    it('should reject non-retryable task status', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 3,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
          },
          taskDetail: {
            count: vi.fn(),
            updateMany: vi.fn(),
          },
          provider: {
            findUnique: vi.fn(),
          },
          model: {
            findUnique: vi.fn(),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1' })

      expect(result).toEqual({
        success: false,
        error: 'Task is not retryable'
      })
    })

    it('should return error when override provider is not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 0,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
            update: vi.fn(),
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(1),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          provider: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
          model: {
            findUnique: vi.fn(),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1', providerId: 2, modelId: 'gpt-4.1' })

      expect(result).toEqual({
        success: false,
        error: 'Provider not found or disabled'
      })
      expect(mockEventBus.emitTaskEvent).not.toHaveBeenCalled()
    })

    it('should return error when override provider is disabled', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 0,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
            update: vi.fn(),
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(1),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          provider: {
            findUnique: vi.fn().mockResolvedValue({ id: 2, name: 'Disabled', status: 1 }),
          },
          model: {
            findUnique: vi.fn(),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1', providerId: 2, modelId: 'gpt-4.1' })

      expect(result).toEqual({
        success: false,
        error: 'Provider not found or disabled'
      })
      expect(mockEventBus.emitTaskEvent).not.toHaveBeenCalled()
    })

    it('should return error when override model is not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'task-1',
              status: 0,
              provider: 1,
              model: 'gpt-4o',
              model_name: 'GPT-4o | OpenAI',
            }),
            update: vi.fn(),
          },
          taskDetail: {
            count: vi.fn().mockResolvedValue(1),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          provider: {
            findUnique: vi.fn().mockResolvedValue({ id: 2, name: 'Anthropic', status: 0 }),
          },
          model: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        }
        return callback(tx)
      })

      const handler = handlers.get('task:retry')
      const result = await handler!({}, { taskId: 'task-1', providerId: 2, modelId: 'gpt-4.1' })

      expect(result).toEqual({
        success: false,
        error: 'Model not found for provider'
      })
      expect(mockEventBus.emitTaskEvent).not.toHaveBeenCalled()
    })
  })

  describe('task:delete', () => {
    it('should delete task and files and emit event', async () => {
      mockFileLogic.deleteTaskFiles.mockResolvedValue(undefined)
      mockTaskRepository.remove.mockResolvedValue({ id: 'task-1' })

      const handler = handlers.get('task:delete')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: true,
        data: { id: 'task-1' }
      })
      expect(mockFileLogic.deleteTaskFiles).toHaveBeenCalledWith('task-1')
      expect(mockTaskRepository.remove).toHaveBeenCalledWith('task-1')
      expect(mockEventBus.emitTaskEvent).toHaveBeenCalledWith(
        'task:deleted',
        expect.objectContaining({
          taskId: 'task-1'
        })
      )
    })

    it('should handle file deletion errors', async () => {
      mockFileLogic.deleteTaskFiles.mockRejectedValue(new Error('File deletion failed'))

      const handler = handlers.get('task:delete')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: false,
        error: 'File deletion failed'
      })
    })
  })

  describe('task:hasRunningTasks', () => {
    it('should return true when running tasks exist', async () => {
      mockPrisma.task.count.mockResolvedValue(5)

      const handler = handlers.get('task:hasRunningTasks')
      const result = await handler!({})

      expect(result).toEqual({
        success: true,
        data: { hasRunning: true, count: 5 }
      })
    })

    it('should return false when no running tasks', async () => {
      mockPrisma.task.count.mockResolvedValue(0)

      const handler = handlers.get('task:hasRunningTasks')
      const result = await handler!({})

      expect(result).toEqual({
        success: true,
        data: { hasRunning: false, count: 0 }
      })
    })

    it('should query for running status tasks', async () => {
      mockPrisma.task.count.mockResolvedValue(0)

      const handler = handlers.get('task:hasRunningTasks')
      await handler!({})

      expect(mockPrisma.task.count).toHaveBeenCalledWith({
        where: {
          status: {
            in: [1, 2, 3, 4, 5] // PENDING, SPLITTING, PROCESSING, READY_TO_MERGE, MERGING
          }
        }
      })
    })
  })
})
