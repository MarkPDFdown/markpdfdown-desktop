import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import { PrismaClient } from '@prisma/client'

// Create mock Prisma client
const prismaMock = mockDeep<PrismaClient>()

// Mock the prisma module
vi.mock('../../db/index.js', () => ({
  prisma: prismaMock
}))

describe('providerDal', () => {
  let providerDal: any

  beforeEach(async () => {
    mockReset(prismaMock)
    // Dynamically import to get fresh module with mocked dependencies
    const module = await import('../providerDal.js')
    providerDal = module.default
  })

  describe('findAll', () => {
    it('should return all enabled providers', async () => {
      const mockProviders = [
        {
          id: 1,
          name: 'OpenAI',
          type: 'openai',
          api_key: 'key1',
          base_url: 'https://api.openai.com',
          suffix: '',
          status: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          name: 'Anthropic',
          type: 'anthropic',
          api_key: 'key2',
          base_url: 'https://api.anthropic.com',
          suffix: '',
          status: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      prismaMock.provider.findMany.mockResolvedValue(mockProviders as any)

      const result = await providerDal.findAll()

      expect(result).toEqual(mockProviders)
      expect(prismaMock.provider.findMany).toHaveBeenCalledWith({
        where: { status: 0 },
        select: {
          id: true,
          name: true,
          type: true,
          api_key: true,
          base_url: true,
          suffix: true,
          status: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ createdAt: 'desc' }]
      })
    })

    it('should return empty array when no providers exist', async () => {
      prismaMock.provider.findMany.mockResolvedValue([])

      const result = await providerDal.findAll()

      expect(result).toEqual([])
    })

    it('should only return enabled providers (status: 0)', async () => {
      const mockProviders = [
        { id: 1, status: 0, name: 'Enabled' } as any
      ]

      prismaMock.provider.findMany.mockResolvedValue(mockProviders)

      await providerDal.findAll()

      expect(prismaMock.provider.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 0 }
        })
      )
    })
  })

  describe('findById', () => {
    it('should return provider by ID', async () => {
      const mockProvider = {
        id: 1,
        name: 'OpenAI',
        type: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com',
        suffix: '',
        status: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.provider.findUnique.mockResolvedValue(mockProvider as any)

      const result = await providerDal.findById(1)

      expect(result).toEqual(mockProvider)
      expect(prismaMock.provider.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          name: true,
          type: true,
          api_key: true,
          base_url: true,
          suffix: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      })
    })

    it('should return null when provider not found', async () => {
      prismaMock.provider.findUnique.mockResolvedValue(null)

      const result = await providerDal.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should create a new provider', async () => {
      const newProviderData = {
        name: 'New Provider',
        type: 'openai',
        api_key: 'new-key',
        base_url: 'https://api.example.com',
        suffix: '/v1',
        status: 0
      }

      const createdProvider = {
        id: 1,
        ...newProviderData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.provider.create.mockResolvedValue(createdProvider as any)

      const result = await providerDal.create(newProviderData)

      expect(result).toEqual(createdProvider)
      expect(prismaMock.provider.create).toHaveBeenCalledWith({
        data: {
          name: 'New Provider',
          type: 'openai',
          api_key: 'new-key',
          base_url: 'https://api.example.com',
          suffix: '/v1',
          status: 0
        }
      })
    })

    it('should use default values for missing fields', async () => {
      const minimalData = {
        name: 'Test',
        type: 'test'
      } as any

      const createdProvider = {
        id: 1,
        name: 'Test',
        type: 'test',
        api_key: '',
        base_url: '',
        suffix: '',
        status: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.provider.create.mockResolvedValue(createdProvider as any)

      await providerDal.create(minimalData)

      expect(prismaMock.provider.create).toHaveBeenCalledWith({
        data: {
          name: 'Test',
          type: 'test',
          api_key: '',
          base_url: '',
          suffix: '',
          status: 0
        }
      })
    })
  })

  describe('update', () => {
    it('should update provider successfully', async () => {
      const updateData = {
        api_key: 'updated-key',
        base_url: 'https://new-url.com'
      }

      const updatedProvider = {
        id: 1,
        name: 'OpenAI',
        type: 'openai',
        ...updateData,
        suffix: '',
        status: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.provider.update.mockResolvedValue(updatedProvider as any)

      const result = await providerDal.update(1, updateData as any)

      expect(result).toEqual(updatedProvider)
      expect(prismaMock.provider.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateData
      })
    })

    it('should allow partial updates', async () => {
      const partialUpdate = { api_key: 'new-key' }

      prismaMock.provider.update.mockResolvedValue({} as any)

      await providerDal.update(1, partialUpdate as any)

      expect(prismaMock.provider.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: partialUpdate
      })
    })
  })

  describe('remove', () => {
    it('should delete provider and cascade delete related models', async () => {
      prismaMock.model.deleteMany.mockResolvedValue({ count: 2 } as any)
      prismaMock.provider.delete.mockResolvedValue({
        id: 1,
        name: 'OpenAI'
      } as any)

      const result = await providerDal.remove(1)

      expect(prismaMock.model.deleteMany).toHaveBeenCalledWith({
        where: { provider: 1 }
      })
      expect(prismaMock.provider.delete).toHaveBeenCalledWith({
        where: { id: 1 }
      })
      expect(result).toEqual({ id: 1, name: 'OpenAI' })
    })

    it('should delete provider even if no models exist', async () => {
      prismaMock.model.deleteMany.mockResolvedValue({ count: 0 } as any)
      prismaMock.provider.delete.mockResolvedValue({
        id: 1,
        name: 'Provider'
      } as any)

      await providerDal.remove(1)

      expect(prismaMock.model.deleteMany).toHaveBeenCalled()
      expect(prismaMock.provider.delete).toHaveBeenCalled()
    })
  })

  describe('updateStatus', () => {
    it('should update provider status', async () => {
      const updatedProvider = {
        id: 1,
        name: 'OpenAI',
        type: 'openai',
        status: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.provider.update.mockResolvedValue(updatedProvider as any)

      const result = await providerDal.updateStatus(1, 1)

      expect(result).toEqual(updatedProvider)
      expect(prismaMock.provider.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 1 }
      })
    })

    it('should accept status 0 (enabled)', async () => {
      prismaMock.provider.update.mockResolvedValue({} as any)

      await providerDal.updateStatus(1, 0)

      expect(prismaMock.provider.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 0 }
      })
    })

    it('should accept status 1 (disabled)', async () => {
      prismaMock.provider.update.mockResolvedValue({} as any)

      await providerDal.updateStatus(1, 1)

      expect(prismaMock.provider.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 1 }
      })
    })
  })
})
