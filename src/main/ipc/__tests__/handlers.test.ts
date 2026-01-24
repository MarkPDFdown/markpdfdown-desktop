import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before imports
const mockProviderDal = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  updateStatus: vi.fn()
}

const mockModelDal = {
  findAll: vi.fn(),
  findByProviderId: vi.fn(),
  create: vi.fn(),
  remove: vi.fn()
}

const mockTaskDal = {
  createTasks: vi.fn(),
  findAll: vi.fn(),
  getTotal: vi.fn(),
  update: vi.fn(),
  remove: vi.fn()
}

const mockFileLogic = {
  getUploadDir: vi.fn(),
  deleteTaskFiles: vi.fn()
}

const mockModelLogic = {
  completion: vi.fn()
}

const mockDialog = {
  showOpenDialog: vi.fn()
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  dialog: mockDialog
}))

vi.mock('../../../core/repositories/ProviderRepository.js', () => ({
  default: mockProviderDal
}))

vi.mock('../../../core/repositories/ModelRepository.js', () => ({
  default: mockModelDal
}))

vi.mock('../../../core/repositories/TaskRepository.js', () => ({
  default: mockTaskDal
}))

vi.mock('../../../core/repositories/TaskDetailRepository.js', () => ({
  default: { findByTaskAndPage: vi.fn(), findByTaskId: vi.fn() }
}))

vi.mock('../../../core/logic/File.js', () => ({
  default: mockFileLogic
}))

vi.mock('../../../core/logic/Model.js', () => ({
  default: mockModelLogic
}))

vi.mock('../../../core/logic/split/ImagePathUtil.js', () => ({
  ImagePathUtil: { getPath: vi.fn(() => '/test/image/path.png') }
}))

vi.mock('../../../core/events/EventBus.js', () => ({
  eventBus: {
    emitTaskEvent: vi.fn(),
  },
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_DELETED: 'task:deleted',
  },
}))

vi.mock('../../../core/db/index.js', () => ({
  prisma: {
    task: { count: vi.fn().mockResolvedValue(0) },
    taskDetail: {
      aggregate: vi.fn().mockResolvedValue({ _count: { id: 0 }, _sum: {}, _avg: {} }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    PROVIDER: {
      GET_ALL: 'provider:getAll',
      GET_BY_ID: 'provider:getById',
      CREATE: 'provider:create',
      UPDATE: 'provider:update',
      DELETE: 'provider:delete',
      UPDATE_STATUS: 'provider:updateStatus',
    },
    MODEL: {
      GET_ALL: 'model:getAll',
      GET_BY_PROVIDER: 'model:getByProvider',
      CREATE: 'model:create',
      DELETE: 'model:delete',
    },
    TASK: {
      CREATE: 'task:create',
      GET_ALL: 'task:getAll',
      GET_BY_ID: 'task:getById',
      UPDATE: 'task:update',
      DELETE: 'task:delete',
      HAS_RUNNING: 'task:hasRunningTasks',
    },
    TASK_DETAIL: {
      GET_BY_PAGE: 'taskDetail:getByPage',
      GET_ALL_BY_TASK: 'taskDetail:getAllByTask',
      RETRY: 'taskDetail:retry',
      RETRY_FAILED: 'taskDetail:retryFailed',
      GET_COST_STATS: 'taskDetail:getCostStats',
    },
    FILE: {
      GET_IMAGE_PATH: 'file:getImagePath',
      DOWNLOAD_MARKDOWN: 'file:downloadMarkdown',
      SELECT_DIALOG: 'file:selectDialog',
      UPLOAD: 'file:upload',
      UPLOAD_MULTIPLE: 'file:uploadMultiple',
      UPLOAD_FILE_CONTENT: 'file:uploadFileContent',
    },
    COMPLETION: {
      MARK_IMAGEDOWN: 'completion:markImagedown',
      TEST_CONNECTION: 'completion:testConnection',
    },
  },
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123')
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024 }))
  }
}))

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    basename: vi.fn((p) => p.split('/').pop()),
    extname: vi.fn((p) => {
      const parts = p.split('.')
      return parts.length > 1 ? '.' + parts[parts.length - 1] : ''
    })
  }
}))

describe('IPC Handlers', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    // Capture all registered handlers
    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    // Import and register handlers
    const { registerIpcHandlers } = await import('../handlers.js')
    registerIpcHandlers()
  })

  describe('Provider Handlers', () => {
    describe('provider:getAll', () => {
      it('should return all providers successfully', async () => {
        const mockProviders = [
          { id: 1, name: 'OpenAI', type: 'openai' },
          { id: 2, name: 'Anthropic', type: 'anthropic' }
        ]
        mockProviderDal.findAll.mockResolvedValue(mockProviders)

        const handler = handlers.get('provider:getAll')
        const result = await handler!({}, {})

        expect(result).toEqual({
          success: true,
          data: mockProviders
        })
        expect(mockProviderDal.findAll).toHaveBeenCalled()
      })

      it('should handle errors', async () => {
        mockProviderDal.findAll.mockRejectedValue(new Error('Database error'))

        const handler = handlers.get('provider:getAll')
        const result = await handler!({}, {})

        expect(result).toEqual({
          success: false,
          error: 'Database error'
        })
      })
    })

    describe('provider:getById', () => {
      it('should return provider by ID successfully', async () => {
        const mockProvider = { id: 1, name: 'OpenAI', type: 'openai' }
        mockProviderDal.findById.mockResolvedValue(mockProvider)

        const handler = handlers.get('provider:getById')
        const result = await handler!({}, 1)

        expect(result).toEqual({
          success: true,
          data: mockProvider
        })
        expect(mockProviderDal.findById).toHaveBeenCalledWith(1)
      })

      it('should return error when provider not found', async () => {
        mockProviderDal.findById.mockResolvedValue(null)

        const handler = handlers.get('provider:getById')
        const result = await handler!({}, 999)

        expect(result).toEqual({
          success: false,
          error: 'Provider not found'
        })
      })
    })

    describe('provider:create', () => {
      it('should create provider successfully', async () => {
        const newProvider = { id: 1, name: 'New Provider', type: 'openai' }
        mockProviderDal.create.mockResolvedValue(newProvider)

        const handler = handlers.get('provider:create')
        const result = await handler!({}, { name: 'New Provider', type: 'openai' })

        expect(result).toEqual({
          success: true,
          data: newProvider
        })
        expect(mockProviderDal.create).toHaveBeenCalledWith({
          name: 'New Provider',
          type: 'openai',
          api_key: '',
          base_url: '',
          suffix: '',
          status: 0
        })
      })

      it('should validate required fields', async () => {
        const handler = handlers.get('provider:create')
        const result = await handler!({}, { name: 'Test' })

        expect(result).toEqual({
          success: false,
          error: 'Name and type are required'
        })
      })
    })

    describe('provider:update', () => {
      it('should update provider successfully', async () => {
        const existingProvider = { id: 1, name: 'OpenAI' }
        const updatedProvider = { id: 1, name: 'OpenAI', api_key: 'new-key' }
        mockProviderDal.findById.mockResolvedValue(existingProvider)
        mockProviderDal.update.mockResolvedValue(updatedProvider)

        const handler = handlers.get('provider:update')
        const result = await handler!({}, 1, { api_key: 'new-key' })

        expect(result).toEqual({
          success: true,
          data: updatedProvider
        })
      })

      it('should return error when provider not found', async () => {
        mockProviderDal.findById.mockResolvedValue(null)

        const handler = handlers.get('provider:update')
        const result = await handler!({}, 999, { api_key: 'key' })

        expect(result).toEqual({
          success: false,
          error: 'Provider not found'
        })
      })
    })

    describe('provider:delete', () => {
      it('should delete provider successfully', async () => {
        mockProviderDal.findById.mockResolvedValue({ id: 1, name: 'Test' })
        mockProviderDal.remove.mockResolvedValue(undefined)

        const handler = handlers.get('provider:delete')
        const result = await handler!({}, 1)

        expect(result).toEqual({ success: true })
        expect(mockProviderDal.remove).toHaveBeenCalledWith(1)
      })

      it('should return error when provider not found', async () => {
        mockProviderDal.findById.mockResolvedValue(null)

        const handler = handlers.get('provider:delete')
        const result = await handler!({}, 999)

        expect(result).toEqual({
          success: false,
          error: 'Provider not found'
        })
      })
    })

    describe('provider:updateStatus', () => {
      it('should update provider status successfully', async () => {
        const provider = { id: 1, name: 'OpenAI', status: 1 }
        mockProviderDal.findById.mockResolvedValue(provider)
        mockProviderDal.updateStatus.mockResolvedValue(provider)

        const handler = handlers.get('provider:updateStatus')
        const result = await handler!({}, 1, 1)

        expect(result).toEqual({
          success: true,
          data: provider
        })
        expect(mockProviderDal.updateStatus).toHaveBeenCalledWith(1, 1)
      })

      it('should validate status value', async () => {
        const handler = handlers.get('provider:updateStatus')
        const result = await handler!({}, 1, undefined)

        expect(result).toEqual({
          success: false,
          error: 'Invalid status value'
        })
      })
    })
  })

  describe('Model Handlers', () => {
    describe('model:getAll', () => {
      it('should return all models grouped by provider', async () => {
        const mockProviders = [
          { id: 1, name: 'OpenAI' },
          { id: 2, name: 'Anthropic' }
        ]
        const mockModels = [
          { id: 'gpt-4o', provider: 1, name: 'GPT-4o' },
          { id: 'claude-3', provider: 2, name: 'Claude 3' }
        ]
        mockProviderDal.findAll.mockResolvedValue(mockProviders)
        mockModelDal.findAll.mockResolvedValue(mockModels)

        const handler = handlers.get('model:getAll')
        const result = await handler!({}, {})

        expect(result.success).toBe(true)
        expect(result.data).toHaveLength(2)
        expect(result.data[0]).toEqual({
          provider: 1,
          providerName: 'OpenAI',
          models: [{ id: 'gpt-4o', provider: 1, name: 'GPT-4o' }]
        })
      })
    })

    describe('model:getByProvider', () => {
      it('should return models for specific provider', async () => {
        const mockModels = [
          { id: 'gpt-4o', provider: 1, name: 'GPT-4o' }
        ]
        mockModelDal.findByProviderId.mockResolvedValue(mockModels)

        const handler = handlers.get('model:getByProvider')
        const result = await handler!({}, 1)

        expect(result).toEqual({
          success: true,
          data: mockModels
        })
        expect(mockModelDal.findByProviderId).toHaveBeenCalledWith(1)
      })
    })

    describe('model:create', () => {
      it('should create model successfully', async () => {
        const newModel = { id: 'gpt-4o', provider: 1, name: 'GPT-4o' }
        mockModelDal.create.mockResolvedValue(newModel)

        const handler = handlers.get('model:create')
        const result = await handler!({}, { id: 'gpt-4o', provider: 1, name: 'GPT-4o' })

        expect(result).toEqual({
          success: true,
          data: newModel
        })
      })

      it('should validate required fields', async () => {
        const handler = handlers.get('model:create')
        const result = await handler!({}, { id: 'gpt-4o' })

        expect(result).toEqual({
          success: false,
          error: 'Model ID, provider ID, and name are required'
        })
      })
    })

    describe('model:delete', () => {
      it('should delete model successfully', async () => {
        mockModelDal.remove.mockResolvedValue(undefined)

        const handler = handlers.get('model:delete')
        const result = await handler!({}, 'gpt-4o', 1)

        expect(result).toEqual({
          success: true,
          data: { message: 'Model deleted successfully' }
        })
        expect(mockModelDal.remove).toHaveBeenCalledWith('gpt-4o', 1)
      })

      it('should validate required parameters', async () => {
        const handler = handlers.get('model:delete')
        const result = await handler!({}, '', 1)

        expect(result).toEqual({
          success: false,
          error: 'Model ID and provider ID are required'
        })
      })
    })
  })

  describe('Task Handlers', () => {
    describe('task:create', () => {
      it('should create tasks with generated UUIDs', async () => {
        const inputTasks = [
          { file: 'test.pdf', model: 'gpt-4o' }
        ]
        const createdTasks = [
          { id: 'test-uuid-123', file: 'test.pdf', model: 'gpt-4o', progress: 0, status: 1 }
        ]
        mockTaskDal.createTasks.mockResolvedValue(createdTasks)

        const handler = handlers.get('task:create')
        const result = await handler!({}, inputTasks)

        expect(result).toEqual({
          success: true,
          data: createdTasks
        })
        expect(mockTaskDal.createTasks).toHaveBeenCalledWith([
          { file: 'test.pdf', model: 'gpt-4o', id: 'test-uuid-123', progress: 0, status: -1 }
        ])
      })

      it('should validate tasks array', async () => {
        const handler = handlers.get('task:create')
        const result = await handler!({}, [])

        expect(result).toEqual({
          success: false,
          error: 'Task list cannot be empty'
        })
      })
    })

    describe('task:getAll', () => {
      it('should return paginated tasks', async () => {
        const mockTasks = [
          { id: '1', status: 1 },
          { id: '2', status: 2 }
        ]
        mockTaskDal.findAll.mockResolvedValue(mockTasks)
        mockTaskDal.getTotal.mockResolvedValue(10)

        const handler = handlers.get('task:getAll')
        const result = await handler!({}, { page: 1, pageSize: 10 })

        expect(result).toEqual({
          success: true,
          data: { list: mockTasks, total: 10 }
        })
        expect(mockTaskDal.findAll).toHaveBeenCalledWith(1, 10)
      })

      it('should use default pagination values', async () => {
        mockTaskDal.findAll.mockResolvedValue([])
        mockTaskDal.getTotal.mockResolvedValue(0)

        const handler = handlers.get('task:getAll')
        await handler!({}, {})

        expect(mockTaskDal.findAll).toHaveBeenCalledWith(1, 10)
      })
    })

    describe('task:update', () => {
      it('should update task successfully', async () => {
        const updatedTask = { id: 'task-1', status: 2, progress: 100 }
        mockTaskDal.update.mockResolvedValue(updatedTask)

        const handler = handlers.get('task:update')
        const result = await handler!({}, 'task-1', { status: 2, progress: 100 })

        expect(result).toEqual({
          success: true,
          data: updatedTask
        })
      })
    })

    describe('task:delete', () => {
      it('should delete task and its files', async () => {
        mockFileLogic.deleteTaskFiles.mockResolvedValue(undefined)
        mockTaskDal.remove.mockResolvedValue({ id: 'task-1' })

        const handler = handlers.get('task:delete')
        const result = await handler!({}, 'task-1')

        expect(result).toEqual({
          success: true,
          data: { id: 'task-1' }
        })
        expect(mockFileLogic.deleteTaskFiles).toHaveBeenCalledWith('task-1')
        expect(mockTaskDal.remove).toHaveBeenCalledWith('task-1')
      })
    })
  })

  describe('File Handlers', () => {
    describe('file:selectDialog', () => {
      it('should open file dialog and return selected files', async () => {
        mockDialog.showOpenDialog.mockResolvedValue({
          filePaths: ['/path/to/file.pdf'],
          canceled: false
        })

        const handler = handlers.get('file:selectDialog')
        const result = await handler!({}, {})

        expect(result).toEqual({
          success: true,
          data: { filePaths: ['/path/to/file.pdf'], canceled: false }
        })
      })

      it('should handle canceled dialog', async () => {
        mockDialog.showOpenDialog.mockResolvedValue({
          filePaths: [],
          canceled: true
        })

        const handler = handlers.get('file:selectDialog')
        const result = await handler!({}, {})

        expect(result.data.canceled).toBe(true)
      })
    })

    describe('file:upload', () => {
      it('should upload file successfully', async () => {
        mockFileLogic.getUploadDir.mockReturnValue('/uploads')

        const handler = handlers.get('file:upload')
        const result = await handler!({}, 'task-123', '/source/file.pdf')

        expect(result.success).toBe(true)
        expect(result.data).toMatchObject({
          originalName: 'file.pdf',
          taskId: 'task-123'
        })
      })

      it('should validate required parameters', async () => {
        const handler = handlers.get('file:upload')
        const result = await handler!({}, '', '/file.pdf')

        expect(result).toEqual({
          success: false,
          error: 'Task ID and file path are required'
        })
      })
    })
  })

  describe('Completion Handlers', () => {
    describe('completion:markImagedown', () => {
      it('should convert image to markdown', async () => {
        const mockResult = { content: '# Markdown content' }
        mockModelLogic.completion.mockResolvedValue(mockResult)

        const handler = handlers.get('completion:markImagedown')
        const result = await handler!({}, 1, 'gpt-4o', 'data:image/png;base64,abc')

        expect(result).toEqual({
          success: true,
          data: mockResult
        })
        expect(mockModelLogic.completion).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            model: 'gpt-4o',
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'user'
              })
            ])
          })
        )
      })

      it('should validate required parameters', async () => {
        const handler = handlers.get('completion:markImagedown')
        const result = await handler!({}, null, 'gpt-4o', 'url')

        expect(result).toEqual({
          success: false,
          error: 'providerId, modelId, and url are required'
        })
      })
    })

    describe('completion:testConnection', () => {
      it('should test connection successfully', async () => {
        const mockResult = { content: 'Connection successful' }
        mockModelLogic.completion.mockResolvedValue(mockResult)

        const handler = handlers.get('completion:testConnection')
        const result = await handler!({}, 1, 'gpt-4o')

        expect(result).toEqual({
          success: true,
          data: mockResult
        })
      })

      it('should validate required parameters', async () => {
        const handler = handlers.get('completion:testConnection')
        const result = await handler!({}, 1, null)

        expect(result).toEqual({
          success: false,
          error: 'providerId and modelId are required'
        })
      })
    })
  })
})
