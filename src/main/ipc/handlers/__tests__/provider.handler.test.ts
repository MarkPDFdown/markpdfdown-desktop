import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockProviderRepository = {
  findAll: vi.fn(),
  findAllIncludeDisabled: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  updateStatus: vi.fn()
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain
}))

vi.mock('../../../../core/domain/repositories/ProviderRepository.js', () => ({
  default: mockProviderRepository
}))

vi.mock('../../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    PROVIDER: {
      GET_ALL: 'provider:getAll',
      GET_BY_ID: 'provider:getById',
      CREATE: 'provider:create',
      UPDATE: 'provider:update',
      DELETE: 'provider:delete',
      UPDATE_STATUS: 'provider:updateStatus'
    }
  }
}))

describe('Provider Handler', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    const { registerProviderHandlers } = await import('../provider.handler.js')
    registerProviderHandlers()
  })

  describe('provider:getAll', () => {
    it('should return all providers', async () => {
      const mockProviders = [
        { id: 1, name: 'OpenAI', type: 'openai' },
        { id: 2, name: 'Anthropic', type: 'anthropic' }
      ]
      mockProviderRepository.findAllIncludeDisabled.mockResolvedValue(mockProviders)

      const handler = handlers.get('provider:getAll')
      const result = await handler!({})

      expect(result).toEqual({
        success: true,
        data: mockProviders
      })
      expect(mockProviderRepository.findAllIncludeDisabled).toHaveBeenCalled()
    })

    it('should handle errors', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockRejectedValue(new Error('Database error'))

      const handler = handlers.get('provider:getAll')
      const result = await handler!({})

      expect(result).toEqual({
        success: false,
        error: 'Database error'
      })
    })
  })

  describe('provider:getById', () => {
    it('should return provider by ID', async () => {
      const mockProvider = { id: 1, name: 'OpenAI', type: 'openai' }
      mockProviderRepository.findById.mockResolvedValue(mockProvider)

      const handler = handlers.get('provider:getById')
      const result = await handler!({}, 1)

      expect(result).toEqual({
        success: true,
        data: mockProvider
      })
      expect(mockProviderRepository.findById).toHaveBeenCalledWith(1)
    })

    it('should return error when provider not found', async () => {
      mockProviderRepository.findById.mockResolvedValue(null)

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
      mockProviderRepository.create.mockResolvedValue(newProvider)

      const handler = handlers.get('provider:create')
      const result = await handler!({}, { name: 'New Provider', type: 'openai' })

      expect(result).toEqual({
        success: true,
        data: newProvider
      })
      expect(mockProviderRepository.create).toHaveBeenCalledWith({
        name: 'New Provider',
        type: 'openai',
        api_key: '',
        base_url: '',
        suffix: '',
        status: 0
      })
    })

    it('should return error when name is missing', async () => {
      const handler = handlers.get('provider:create')
      const result = await handler!({}, { type: 'openai' })

      expect(result).toEqual({
        success: false,
        error: 'Name and type are required'
      })
    })

    it('should return error when type is missing', async () => {
      const handler = handlers.get('provider:create')
      const result = await handler!({}, { name: 'Test' })

      expect(result).toEqual({
        success: false,
        error: 'Name and type are required'
      })
    })
  })

  describe('provider:update', () => {
    it('should update api_key successfully', async () => {
      const existingProvider = { id: 1, name: 'OpenAI' }
      const updatedProvider = { id: 1, name: 'OpenAI', api_key: 'new-key' }
      mockProviderRepository.findById.mockResolvedValue(existingProvider)
      mockProviderRepository.update.mockResolvedValue(updatedProvider)

      const handler = handlers.get('provider:update')
      const result = await handler!({}, 1, { api_key: 'new-key' })

      expect(result).toEqual({
        success: true,
        data: updatedProvider
      })
      expect(mockProviderRepository.update).toHaveBeenCalledWith(1, { api_key: 'new-key' })
    })

    it('should update base_url successfully', async () => {
      const existingProvider = { id: 1, name: 'OpenAI' }
      mockProviderRepository.findById.mockResolvedValue(existingProvider)
      mockProviderRepository.update.mockResolvedValue({ ...existingProvider, base_url: 'https://api.example.com' })

      const handler = handlers.get('provider:update')
      const result = await handler!({}, 1, { base_url: 'https://api.example.com' })

      expect(result.success).toBe(true)
      expect(mockProviderRepository.update).toHaveBeenCalledWith(1, { base_url: 'https://api.example.com' })
    })

    it('should return error when provider not found', async () => {
      mockProviderRepository.findById.mockResolvedValue(null)

      const handler = handlers.get('provider:update')
      const result = await handler!({}, 999, { api_key: 'key' })

      expect(result).toEqual({
        success: false,
        error: 'Provider not found'
      })
    })

    it('should only update allowed fields', async () => {
      mockProviderRepository.findById.mockResolvedValue({ id: 1 })
      mockProviderRepository.update.mockResolvedValue({ id: 1 })

      const handler = handlers.get('provider:update')
      await handler!({}, 1, { api_key: 'key', base_url: 'url', suffix: 'suffix', name: 'ignored' })

      expect(mockProviderRepository.update).toHaveBeenCalledWith(1, {
        api_key: 'key',
        base_url: 'url',
        suffix: 'suffix'
      })
    })
  })

  describe('provider:delete', () => {
    it('should delete provider successfully', async () => {
      mockProviderRepository.findById.mockResolvedValue({ id: 1, name: 'Test' })
      mockProviderRepository.remove.mockResolvedValue(undefined)

      const handler = handlers.get('provider:delete')
      const result = await handler!({}, 1)

      expect(result).toEqual({ success: true })
      expect(mockProviderRepository.remove).toHaveBeenCalledWith(1)
    })

    it('should return error when provider not found', async () => {
      mockProviderRepository.findById.mockResolvedValue(null)

      const handler = handlers.get('provider:delete')
      const result = await handler!({}, 999)

      expect(result).toEqual({
        success: false,
        error: 'Provider not found'
      })
    })
  })

  describe('provider:updateStatus', () => {
    it('should update status successfully', async () => {
      const provider = { id: 1, name: 'OpenAI', status: 1 }
      mockProviderRepository.findById.mockResolvedValue(provider)
      mockProviderRepository.updateStatus.mockResolvedValue(provider)

      const handler = handlers.get('provider:updateStatus')
      const result = await handler!({}, 1, 1)

      expect(result).toEqual({
        success: true,
        data: provider
      })
      expect(mockProviderRepository.updateStatus).toHaveBeenCalledWith(1, 1)
    })

    it('should return error when status is undefined', async () => {
      const handler = handlers.get('provider:updateStatus')
      const result = await handler!({}, 1, undefined)

      expect(result).toEqual({
        success: false,
        error: 'Invalid status value'
      })
    })

    it('should return error when provider not found', async () => {
      mockProviderRepository.findById.mockResolvedValue(null)

      const handler = handlers.get('provider:updateStatus')
      const result = await handler!({}, 999, 1)

      expect(result).toEqual({
        success: false,
        error: 'Provider not found'
      })
    })
  })
})
