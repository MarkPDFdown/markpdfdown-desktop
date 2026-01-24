import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockProviderRepository = {
  findAll: vi.fn()
}

const mockModelRepository = {
  findAll: vi.fn(),
  findByProviderId: vi.fn(),
  create: vi.fn(),
  remove: vi.fn()
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain
}))

vi.mock('../../../../core/repositories/ProviderRepository.js', () => ({
  default: mockProviderRepository
}))

vi.mock('../../../../core/repositories/ModelRepository.js', () => ({
  default: mockModelRepository
}))

vi.mock('../../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    MODEL: {
      GET_ALL: 'model:getAll',
      GET_BY_PROVIDER: 'model:getByProvider',
      CREATE: 'model:create',
      DELETE: 'model:delete'
    }
  }
}))

describe('Model Handler', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    const { registerModelHandlers } = await import('../model.handler.js')
    registerModelHandlers()
  })

  describe('model:getAll', () => {
    it('should return models grouped by provider', async () => {
      const mockProviders = [
        { id: 1, name: 'OpenAI' },
        { id: 2, name: 'Anthropic' }
      ]
      const mockModels = [
        { id: 'gpt-4o', provider: 1, name: 'GPT-4o' },
        { id: 'gpt-4o-mini', provider: 1, name: 'GPT-4o Mini' },
        { id: 'claude-3', provider: 2, name: 'Claude 3' }
      ]
      mockProviderRepository.findAll.mockResolvedValue(mockProviders)
      mockModelRepository.findAll.mockResolvedValue(mockModels)

      const handler = handlers.get('model:getAll')
      const result = await handler!({})

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toEqual({
        provider: 1,
        providerName: 'OpenAI',
        models: [
          { id: 'gpt-4o', provider: 1, name: 'GPT-4o' },
          { id: 'gpt-4o-mini', provider: 1, name: 'GPT-4o Mini' }
        ]
      })
      expect(result.data[1]).toEqual({
        provider: 2,
        providerName: 'Anthropic',
        models: [{ id: 'claude-3', provider: 2, name: 'Claude 3' }]
      })
    })

    it('should return empty models for providers with no models', async () => {
      const mockProviders = [{ id: 1, name: 'OpenAI' }]
      mockProviderRepository.findAll.mockResolvedValue(mockProviders)
      mockModelRepository.findAll.mockResolvedValue([])

      const handler = handlers.get('model:getAll')
      const result = await handler!({})

      expect(result.data[0].models).toEqual([])
    })

    it('should handle errors', async () => {
      mockProviderRepository.findAll.mockRejectedValue(new Error('Database error'))

      const handler = handlers.get('model:getAll')
      const result = await handler!({})

      expect(result).toEqual({
        success: false,
        error: 'Database error'
      })
    })
  })

  describe('model:getByProvider', () => {
    it('should return models for specific provider', async () => {
      const mockModels = [
        { id: 'gpt-4o', provider: 1, name: 'GPT-4o' },
        { id: 'gpt-4o-mini', provider: 1, name: 'GPT-4o Mini' }
      ]
      mockModelRepository.findByProviderId.mockResolvedValue(mockModels)

      const handler = handlers.get('model:getByProvider')
      const result = await handler!({}, 1)

      expect(result).toEqual({
        success: true,
        data: mockModels
      })
      expect(mockModelRepository.findByProviderId).toHaveBeenCalledWith(1)
    })

    it('should return empty array when provider has no models', async () => {
      mockModelRepository.findByProviderId.mockResolvedValue([])

      const handler = handlers.get('model:getByProvider')
      const result = await handler!({}, 99)

      expect(result).toEqual({
        success: true,
        data: []
      })
    })
  })

  describe('model:create', () => {
    it('should create model successfully', async () => {
      const newModel = { id: 'gpt-4o', provider: 1, name: 'GPT-4o' }
      mockModelRepository.create.mockResolvedValue(newModel)

      const handler = handlers.get('model:create')
      const result = await handler!({}, { id: 'gpt-4o', provider: 1, name: 'GPT-4o' })

      expect(result).toEqual({
        success: true,
        data: newModel
      })
      expect(mockModelRepository.create).toHaveBeenCalledWith({
        id: 'gpt-4o',
        provider: 1,
        name: 'GPT-4o'
      })
    })

    it('should return error when id is missing', async () => {
      const handler = handlers.get('model:create')
      const result = await handler!({}, { provider: 1, name: 'GPT-4o' })

      expect(result).toEqual({
        success: false,
        error: 'Model ID, provider ID, and name are required'
      })
    })

    it('should return error when provider is missing', async () => {
      const handler = handlers.get('model:create')
      const result = await handler!({}, { id: 'gpt-4o', name: 'GPT-4o' })

      expect(result).toEqual({
        success: false,
        error: 'Model ID, provider ID, and name are required'
      })
    })

    it('should return error when name is missing', async () => {
      const handler = handlers.get('model:create')
      const result = await handler!({}, { id: 'gpt-4o', provider: 1 })

      expect(result).toEqual({
        success: false,
        error: 'Model ID, provider ID, and name are required'
      })
    })

    it('should handle database errors', async () => {
      mockModelRepository.create.mockRejectedValue(new Error('Duplicate key'))

      const handler = handlers.get('model:create')
      const result = await handler!({}, { id: 'gpt-4o', provider: 1, name: 'GPT-4o' })

      expect(result).toEqual({
        success: false,
        error: 'Duplicate key'
      })
    })
  })

  describe('model:delete', () => {
    it('should delete model successfully', async () => {
      mockModelRepository.remove.mockResolvedValue(undefined)

      const handler = handlers.get('model:delete')
      const result = await handler!({}, 'gpt-4o', 1)

      expect(result).toEqual({
        success: true,
        data: { message: 'Model deleted successfully' }
      })
      expect(mockModelRepository.remove).toHaveBeenCalledWith('gpt-4o', 1)
    })

    it('should return error when id is missing', async () => {
      const handler = handlers.get('model:delete')
      const result = await handler!({}, '', 1)

      expect(result).toEqual({
        success: false,
        error: 'Model ID and provider ID are required'
      })
    })

    it('should return error when provider is missing', async () => {
      const handler = handlers.get('model:delete')
      const result = await handler!({}, 'gpt-4o', null)

      expect(result).toEqual({
        success: false,
        error: 'Model ID and provider ID are required'
      })
    })

    it('should handle deletion errors', async () => {
      mockModelRepository.remove.mockRejectedValue(new Error('Model not found'))

      const handler = handlers.get('model:delete')
      const result = await handler!({}, 'non-existent', 1)

      expect(result).toEqual({
        success: false,
        error: 'Model not found'
      })
    })
  })
})
