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
      UPDATE_STATUS: 'provider:updateStatus',
      GET_PRESETS: 'provider:getPresets',
      FETCH_MODEL_LIST: 'provider:fetchModelList'
    }
  }
}))

vi.mock('../../../../core/infrastructure/config/providerPresets.js', () => ({
  providerPresets: [
    {
      name: 'OpenAI',
      type: 'openai-responses',
      apiBase: 'https://api.openai.com/v1',
      modelListApi: '/models',
      modelNameField: 'id',
      modelIdField: 'id',
    },
    {
      name: 'Anthropic',
      type: 'anthropic',
      apiBase: 'https://api.anthropic.com/v1',
      modelListApi: '/models',
      modelNameField: 'display_name',
      modelIdField: 'id',
      capabilityField: 'input_modalities',
      capabilityFilter: 'image',
    },
    {
      name: 'OpenRouter',
      type: 'openai',
      apiBase: 'https://openrouter.ai/api/v1',
      modelListApi: '/models',
      modelNameField: 'name',
      modelIdField: 'id',
      capabilityField: 'architecture.input_modalities',
      capabilityFilter: 'image',
    },
  ],
  findProviderPreset: (type: string, name: string) => {
    const presets = [
      { name: 'OpenAI', type: 'openai-responses', apiBase: 'https://api.openai.com/v1', modelListApi: '/models', modelNameField: 'id', modelIdField: 'id' },
      { name: 'Anthropic', type: 'anthropic', apiBase: 'https://api.anthropic.com/v1', modelListApi: '/models', modelNameField: 'display_name', modelIdField: 'id', capabilityField: 'input_modalities', capabilityFilter: 'image' },
      { name: 'OpenRouter', type: 'openai', apiBase: 'https://openrouter.ai/api/v1', modelListApi: '/models', modelNameField: 'name', modelIdField: 'id', capabilityField: 'architecture.input_modalities', capabilityFilter: 'image' },
    ]
    return presets.find(p => p.type === type && p.name === name)
  },
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

  describe('provider:getPresets', () => {
    it('should return all provider presets', async () => {
      const handler = handlers.get('provider:getPresets')
      const result = await handler!({})

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(3)
      expect(result.data[0].name).toBe('OpenAI')
      expect(result.data[1].name).toBe('Anthropic')
      expect(result.data[2].name).toBe('OpenRouter')
    })
  })

  describe('provider:fetchModelList', () => {
    it('should return error when provider not found', async () => {
      mockProviderRepository.findById.mockResolvedValue(null)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 999)

      expect(result).toEqual({
        success: false,
        error: 'Provider not found'
      })
    })

    it('should return error when no base_url for custom provider', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'Custom', type: 'openai', api_key: '', base_url: ''
      })

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result).toEqual({
        success: false,
        error: 'No API base URL configured for this provider'
      })
    })

    it('should use preset apiBase when provider has no base_url', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenAI', type: 'openai-responses', api_key: 'sk-test', base_url: ''
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'gpt-4o' }] }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      await handler!({}, 1)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.any(Object)
      )
    })

    it('should use provider base_url over preset apiBase', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenAI', type: 'openai-responses', api_key: 'sk-test', base_url: 'https://custom.api.com'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      await handler!({}, 1)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/models',
        expect.any(Object)
      )
    })

    it('should use /models as default modelListApi for custom providers', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'MyCustom', type: 'openai', api_key: 'key', base_url: 'https://my-api.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'model-1' }] }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://my-api.com/v1/models',
        expect.any(Object)
      )
      expect(result.success).toBe(true)
    })

    it('should set Bearer auth for openai type', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenAI', type: 'openai-responses', api_key: 'sk-test', base_url: 'https://api.openai.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      await handler!({}, 1)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test'
          })
        })
      )
    })

    it('should set x-api-key auth for anthropic type', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'Anthropic', type: 'anthropic', api_key: 'sk-ant-test', base_url: 'https://api.anthropic.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      await handler!({}, 1)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
            'anthropic-version': '2023-06-01'
          })
        })
      )
    })

    it('should handle HTTP error responses', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenAI', type: 'openai-responses', api_key: 'sk-test', base_url: 'https://api.openai.com/v1'
      })

      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized')
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('HTTP 401')
    })

    it('should parse openai format response', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenAI', type: 'openai-responses', api_key: 'sk-test', base_url: 'https://api.openai.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-mini', object: 'model' }
          ]
        }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([
        { id: 'gpt-4o', name: 'gpt-4o' },
        { id: 'gpt-4o-mini', name: 'gpt-4o-mini' }
      ])
    })

    it('should filter models by capabilityField for anthropic preset', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'Anthropic', type: 'anthropic', api_key: 'key', base_url: 'https://api.anthropic.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet', input_modalities: ['text', 'image'] },
            { id: 'claude-3-haiku', display_name: 'Claude 3 Haiku', input_modalities: ['text'] },
            { id: 'claude-unknown', display_name: 'Claude Unknown' }
          ]
        }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result.success).toBe(true)
      // claude-3-5-sonnet has image -> included
      // claude-3-haiku has only text -> excluded
      // claude-unknown has no input_modalities -> included (no array = skip filter)
      expect(result.data).toHaveLength(2)
      expect(result.data[0].id).toBe('claude-3-5-sonnet')
      expect(result.data[1].id).toBe('claude-unknown')
    })

    it('should filter models by nested capabilityField for openrouter preset', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenRouter', type: 'openai', api_key: 'key', base_url: 'https://openrouter.ai/api/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'model-vision', name: 'Vision Model', architecture: { input_modalities: ['text', 'image'] } },
            { id: 'model-text', name: 'Text Model', architecture: { input_modalities: ['text'] } },
            { id: 'model-no-arch', name: 'No Arch Model' }
          ]
        }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data[0].id).toBe('model-vision')
      expect(result.data[1].id).toBe('model-no-arch')
    })

    it('should not filter when preset has no capabilityField', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'OpenAI', type: 'openai-responses', api_key: 'key', base_url: 'https://api.openai.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'gpt-4o', input_modalities: ['text', 'image'] },
            { id: 'gpt-3.5', input_modalities: ['text'] }
          ]
        }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should not filter for custom providers without preset', async () => {
      mockProviderRepository.findById.mockResolvedValue({
        id: 1, name: 'MyCustom', type: 'openai', api_key: 'key', base_url: 'https://my-api.com/v1'
      })

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'model-a' },
            { id: 'model-b' }
          ]
        }),
        text: vi.fn()
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const handler = handlers.get('provider:fetchModelList')
      const result = await handler!({}, 1)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })
  })
})
