import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import { PrismaClient } from '@prisma/client'

const prismaMock = mockDeep<PrismaClient>()

vi.mock('../../db/index.js', () => ({
  prisma: prismaMock
}))

describe('modelDal', () => {
  let modelDal: any

  beforeEach(async () => {
    mockReset(prismaMock)
    const module = await import('../ModelRepository.js')
    modelDal = module.default
  })

  describe('findAll', () => {
    it('should return all models', async () => {
      const mockModels = [
        { id: 'gpt-4o', provider: 1, name: 'GPT-4o', createdAt: new Date() },
        { id: 'claude-3', provider: 2, name: 'Claude 3', createdAt: new Date() }
      ]

      prismaMock.model.findMany.mockResolvedValue(mockModels as any)

      const result = await modelDal.findAll()

      expect(result).toEqual(mockModels)
      expect(prismaMock.model.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }]
      })
    })

    it('should return empty array when no models exist', async () => {
      prismaMock.model.findMany.mockResolvedValue([])

      const result = await modelDal.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findByProviderId', () => {
    it('should return models for specific provider', async () => {
      const mockModels = [
        { id: 'gpt-4o', provider: 1, name: 'GPT-4o', createdAt: new Date() },
        { id: 'gpt-4o-mini', provider: 1, name: 'GPT-4o Mini', createdAt: new Date() }
      ]

      prismaMock.model.findMany.mockResolvedValue(mockModels as any)

      const result = await modelDal.findByProviderId(1)

      expect(result).toEqual(mockModels)
      expect(prismaMock.model.findMany).toHaveBeenCalledWith({
        where: { provider: 1 },
        orderBy: [{ createdAt: 'desc' }]
      })
    })

    it('should return empty array when provider has no models', async () => {
      prismaMock.model.findMany.mockResolvedValue([])

      const result = await modelDal.findByProviderId(999)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('should create a new model', async () => {
      const newModelData = {
        id: 'gpt-4o',
        provider: 1,
        name: 'GPT-4o'
      }

      const createdModel = {
        ...newModelData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.model.create.mockResolvedValue(createdModel as any)

      const result = await modelDal.create(newModelData)

      expect(result).toEqual(createdModel)
      expect(prismaMock.model.create).toHaveBeenCalledWith({
        data: newModelData
      })
    })

    it('should handle composite key (id + provider)', async () => {
      const modelData = {
        id: 'claude-3',
        provider: 2,
        name: 'Claude 3'
      }

      prismaMock.model.create.mockResolvedValue(modelData as any)

      await modelDal.create(modelData)

      expect(prismaMock.model.create).toHaveBeenCalledWith({
        data: modelData
      })
    })
  })

  describe('remove', () => {
    it('should delete model using composite key', async () => {
      const deletedModel = {
        id: 'gpt-4o',
        provider: 1,
        name: 'GPT-4o'
      }

      prismaMock.model.delete.mockResolvedValue(deletedModel as any)

      const result = await modelDal.remove('gpt-4o', 1)

      expect(result).toEqual(deletedModel)
      expect(prismaMock.model.delete).toHaveBeenCalledWith({
        where: {
          id_provider: {
            id: 'gpt-4o',
            provider: 1
          }
        }
      })
    })

    it('should correctly identify model by both id and provider', async () => {
      prismaMock.model.delete.mockResolvedValue({} as any)

      await modelDal.remove('claude-3', 2)

      expect(prismaMock.model.delete).toHaveBeenCalledWith({
        where: {
          id_provider: {
            id: 'claude-3',
            provider: 2
          }
        }
      })
    })
  })

  describe('removeByProviderId', () => {
    it('should delete all models for a provider', async () => {
      prismaMock.model.deleteMany.mockResolvedValue({ count: 3 } as any)

      const result = await modelDal.removeByProviderId(1)

      expect(result).toEqual({ count: 3 })
      expect(prismaMock.model.deleteMany).toHaveBeenCalledWith({
        where: { provider: 1 }
      })
    })

    it('should return count 0 when provider has no models', async () => {
      prismaMock.model.deleteMany.mockResolvedValue({ count: 0 } as any)

      const result = await modelDal.removeByProviderId(999)

      expect(result.count).toBe(0)
    })
  })
})
