import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockProviderRepository = {
  findAllIncludeDisabled: vi.fn(),
  create: vi.fn(),
}

vi.mock('../../../domain/repositories/ProviderRepository.js', () => ({
  default: mockProviderRepository,
}))

vi.mock('../../../infrastructure/config/providerPresets.js', () => ({
  providerPresets: [
    {
      name: 'TestProvider1',
      type: 'openai',
      apiBase: 'https://api.test1.com/v1',
      modelListApi: '/models',
      modelNameField: 'id',
      modelIdField: 'id',
    },
    {
      name: 'TestProvider2',
      type: 'anthropic',
      apiBase: 'https://api.test2.com/v1',
      modelListApi: '/models',
      modelNameField: 'display_name',
      modelIdField: 'id',
    },
  ],
  getProviderPresetKey: (type: string, name: string) => `${type}:${name}`,
}))

describe('PresetProviderService', () => {
  let PresetProviderService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset module to get fresh singleton
    vi.resetModules()
    const module = await import('../PresetProviderService.js')
    PresetProviderService = module.PresetProviderService
  })

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = PresetProviderService.getInstance()
      const instance2 = PresetProviderService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('initialize', () => {
    it('should insert all presets when none exist', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockResolvedValue([])
      mockProviderRepository.create.mockResolvedValue({})

      const service = PresetProviderService.getInstance()
      await service.initialize()

      expect(mockProviderRepository.create).toHaveBeenCalledTimes(2)
      expect(mockProviderRepository.create).toHaveBeenCalledWith({
        name: 'TestProvider1',
        type: 'openai',
        api_key: '',
        base_url: 'https://api.test1.com/v1',
        suffix: '',
        status: -1,
      })
      expect(mockProviderRepository.create).toHaveBeenCalledWith({
        name: 'TestProvider2',
        type: 'anthropic',
        api_key: '',
        base_url: 'https://api.test2.com/v1',
        suffix: '',
        status: -1,
      })
    })

    it('should skip presets that already exist', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockResolvedValue([
        { name: 'TestProvider1', type: 'openai' },
      ])
      mockProviderRepository.create.mockResolvedValue({})

      const service = PresetProviderService.getInstance()
      await service.initialize()

      expect(mockProviderRepository.create).toHaveBeenCalledTimes(1)
      expect(mockProviderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TestProvider2' })
      )
    })

    it('should not insert anything when all presets exist', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockResolvedValue([
        { name: 'TestProvider1', type: 'openai' },
        { name: 'TestProvider2', type: 'anthropic' },
      ])

      const service = PresetProviderService.getInstance()
      await service.initialize()

      expect(mockProviderRepository.create).not.toHaveBeenCalled()
    })

    it('should skip if already initialized', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockResolvedValue([])
      mockProviderRepository.create.mockResolvedValue({})

      const service = PresetProviderService.getInstance()
      await service.initialize()
      await service.initialize()

      // findAllIncludeDisabled should only be called once
      expect(mockProviderRepository.findAllIncludeDisabled).toHaveBeenCalledTimes(1)
    })

    it('should allow re-initialization after reset', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockResolvedValue([])
      mockProviderRepository.create.mockResolvedValue({})

      const service = PresetProviderService.getInstance()
      await service.initialize()
      service.reset()
      await service.initialize()

      expect(mockProviderRepository.findAllIncludeDisabled).toHaveBeenCalledTimes(2)
    })

    it('should throw error when repository fails', async () => {
      mockProviderRepository.findAllIncludeDisabled.mockRejectedValue(
        new Error('Database connection failed')
      )

      const service = PresetProviderService.getInstance()
      await expect(service.initialize()).rejects.toThrow('Database connection failed')
    })
  })
})
