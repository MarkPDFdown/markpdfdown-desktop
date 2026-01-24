import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import { PrismaClient } from '@prisma/client'

const prismaMock = mockDeep<PrismaClient>()

vi.mock('../../db/index.js', () => ({
  prisma: prismaMock
}))

describe('TaskDetailRepository', () => {
  let taskDetailRepository: any

  beforeEach(async () => {
    mockReset(prismaMock)
    const module = await import('../TaskDetailRepository.js')
    taskDetailRepository = module.default
  })

  describe('findByTaskId', () => {
    it('should return task details sorted by page number', async () => {
      const mockDetails = [
        { id: 'detail-1', task: 'task-1', page: 1, status: 0 },
        { id: 'detail-2', task: 'task-1', page: 2, status: 0 },
        { id: 'detail-3', task: 'task-1', page: 3, status: 0 }
      ]

      prismaMock.taskDetail.findMany.mockResolvedValue(mockDetails as any)

      const result = await taskDetailRepository.findByTaskId('task-1')

      expect(result).toEqual(mockDetails)
      expect(prismaMock.taskDetail.findMany).toHaveBeenCalledWith({
        where: { task: 'task-1' },
        orderBy: { page: 'asc' }
      })
    })

    it('should return empty array for task with no details', async () => {
      prismaMock.taskDetail.findMany.mockResolvedValue([])

      const result = await taskDetailRepository.findByTaskId('empty-task')

      expect(result).toEqual([])
      expect(prismaMock.taskDetail.findMany).toHaveBeenCalledWith({
        where: { task: 'empty-task' },
        orderBy: { page: 'asc' }
      })
    })

    it('should call DAL with correct parameters', async () => {
      prismaMock.taskDetail.findMany.mockResolvedValue([])

      await taskDetailRepository.findByTaskId('task-123')

      expect(prismaMock.taskDetail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: 'task-123' },
          orderBy: { page: 'asc' }
        })
      )
    })
  })

  describe('findByTaskAndPage', () => {
    it('should return task detail for specific task and page', async () => {
      const mockDetail = {
        id: 'detail-1',
        task: 'task-1',
        page: 5,
        status: 2,
        content: '# Page 5 content'
      }

      prismaMock.taskDetail.findFirst.mockResolvedValue(mockDetail as any)

      const result = await taskDetailRepository.findByTaskAndPage('task-1', 5)

      expect(result).toEqual(mockDetail)
      expect(prismaMock.taskDetail.findFirst).toHaveBeenCalledWith({
        where: {
          task: 'task-1',
          page: 5
        }
      })
    })

    it('should return null when task detail does not exist', async () => {
      prismaMock.taskDetail.findFirst.mockResolvedValue(null)

      const result = await taskDetailRepository.findByTaskAndPage('non-existent', 99)

      expect(result).toBeNull()
      expect(prismaMock.taskDetail.findFirst).toHaveBeenCalledWith({
        where: {
          task: 'non-existent',
          page: 99
        }
      })
    })

    it('should query with exact task ID and page number', async () => {
      prismaMock.taskDetail.findFirst.mockResolvedValue(null)

      await taskDetailRepository.findByTaskAndPage('task-abc', 10)

      expect(prismaMock.taskDetail.findFirst).toHaveBeenCalledWith({
        where: {
          task: 'task-abc',
          page: 10
        }
      })
    })
  })

  describe('countByTaskId', () => {
    it('should return correct count of pages', async () => {
      prismaMock.taskDetail.count.mockResolvedValue(15)

      const result = await taskDetailRepository.countByTaskId('task-1')

      expect(result).toBe(15)
      expect(prismaMock.taskDetail.count).toHaveBeenCalledWith({
        where: { task: 'task-1' }
      })
    })

    it('should return 0 for task with no details', async () => {
      prismaMock.taskDetail.count.mockResolvedValue(0)

      const result = await taskDetailRepository.countByTaskId('empty-task')

      expect(result).toBe(0)
    })

    it('should count pages for specified task only', async () => {
      prismaMock.taskDetail.count.mockResolvedValue(5)

      await taskDetailRepository.countByTaskId('specific-task')

      expect(prismaMock.taskDetail.count).toHaveBeenCalledWith({
        where: { task: 'specific-task' }
      })
    })
  })
})
