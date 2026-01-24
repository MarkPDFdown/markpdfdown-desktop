import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import { PrismaClient } from '@prisma/client'

const prismaMock = mockDeep<PrismaClient>()

vi.mock('../../db/index.js', () => ({
  prisma: prismaMock
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123')
}))

describe('taskDal', () => {
  let taskDal: any

  beforeEach(async () => {
    mockReset(prismaMock)
    const module = await import('../TaskDal.js')
    taskDal = module.default
  })

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          filename: 'test.pdf',
          status: 0,
          createdAt: new Date()
        },
        {
          id: 'task-2',
          filename: 'test2.pdf',
          status: 1,
          createdAt: new Date()
        }
      ]

      prismaMock.task.findMany.mockResolvedValue(mockTasks as any)

      const result = await taskDal.findAll(1, 10)

      expect(result).toEqual(mockTasks)
      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' }
      })
    })

    it('should calculate correct skip for page 2', async () => {
      prismaMock.task.findMany.mockResolvedValue([])

      await taskDal.findAll(2, 10)

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' }
      })
    })

    it('should support custom page size', async () => {
      prismaMock.task.findMany.mockResolvedValue([])

      await taskDal.findAll(1, 20)

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' }
      })
    })

    it('should order by createdAt desc', async () => {
      prismaMock.task.findMany.mockResolvedValue([])

      await taskDal.findAll(1, 10)

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' }
        })
      )
    })
  })

  describe('getTotal', () => {
    it('should return total count of tasks', async () => {
      prismaMock.task.count.mockResolvedValue(42)

      const result = await taskDal.getTotal()

      expect(result).toBe(42)
      expect(prismaMock.task.count).toHaveBeenCalled()
    })

    it('should return 0 when no tasks exist', async () => {
      prismaMock.task.count.mockResolvedValue(0)

      const result = await taskDal.getTotal()

      expect(result).toBe(0)
    })
  })

  describe('create', () => {
    it('should create task with UUID', async () => {
      const taskData = {
        filename: 'test.pdf',
        type: 'pdf',
        page_range: '1-10',
        pages: 10,
        provider: 1,
        model: 'gpt-4o',
        model_name: 'GPT-4o'
      } as any

      const createdTask = {
        id: 'test-uuid-123',
        ...taskData,
        progress: 0,
        status: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.task.create.mockResolvedValue(createdTask as any)

      const result = await taskDal.create(taskData)

      expect(result).toEqual(createdTask)
      expect(prismaMock.task.create).toHaveBeenCalledWith({
        data: {
          id: 'test-uuid-123',
          filename: 'test.pdf',
          type: 'pdf',
          page_range: '1-10',
          pages: 10,
          provider: 1,
          model: 'gpt-4o',
          model_name: 'GPT-4o',
          progress: 0,
          status: 0
        }
      })
    })

    it('should use default values for missing fields', async () => {
      const minimalData = {} as any

      prismaMock.task.create.mockResolvedValue({} as any)

      await taskDal.create(minimalData)

      expect(prismaMock.task.create).toHaveBeenCalledWith({
        data: {
          id: 'test-uuid-123',
          filename: '',
          type: '',
          page_range: '',
          pages: 0,
          provider: 0,
          model: '',
          model_name: '',
          progress: 0,
          status: 0
        }
      })
    })
  })

  describe('createTasks', () => {
    it('should create multiple tasks', async () => {
      const tasksData = [
        { filename: 'test1.pdf', model: 'gpt-4o' },
        { filename: 'test2.pdf', model: 'claude-3' }
      ] as any[]

      const createdTasks = [
        { id: 'test-uuid-123', filename: 'test1.pdf', model: 'gpt-4o' },
        { id: 'test-uuid-123', filename: 'test2.pdf', model: 'claude-3' }
      ]

      prismaMock.task.create
        .mockResolvedValueOnce(createdTasks[0] as any)
        .mockResolvedValueOnce(createdTasks[1] as any)

      const result = await taskDal.createTasks(tasksData)

      expect(result).toHaveLength(2)
      expect(prismaMock.task.create).toHaveBeenCalledTimes(2)
    })

    it('should handle empty array', async () => {
      const result = await taskDal.createTasks([])

      expect(result).toEqual([])
      expect(prismaMock.task.create).not.toHaveBeenCalled()
    })

    it('should create tasks sequentially', async () => {
      const tasksData = [
        { filename: 'test1.pdf' },
        { filename: 'test2.pdf' },
        { filename: 'test3.pdf' }
      ] as any[]

      prismaMock.task.create.mockResolvedValue({} as any)

      await taskDal.createTasks(tasksData)

      expect(prismaMock.task.create).toHaveBeenCalledTimes(3)
    })
  })

  describe('update', () => {
    it('should update task', async () => {
      const updateData = {
        status: 2,
        progress: 100,
        result: 'Completed'
      } as any

      const updatedTask = {
        id: 'task-1',
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.task.update.mockResolvedValue(updatedTask as any)

      const result = await taskDal.update('task-1', updateData)

      expect(result).toEqual(updatedTask)
      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: updateData
      })
    })

    it('should allow partial updates', async () => {
      const partialUpdate = { progress: 50 } as any

      prismaMock.task.update.mockResolvedValue({} as any)

      await taskDal.update('task-1', partialUpdate)

      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: partialUpdate
      })
    })
  })

  describe('remove', () => {
    it('should delete task and related task details', async () => {
      prismaMock.task.delete.mockResolvedValue({
        id: 'task-1',
        filename: 'test.pdf'
      } as any)
      prismaMock.taskDetail.deleteMany.mockResolvedValue({ count: 3 } as any)

      const result = await taskDal.remove('task-1')

      expect(prismaMock.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-1' }
      })
      expect(prismaMock.taskDetail.deleteMany).toHaveBeenCalledWith({
        where: { task: 'task-1' }
      })
      expect(result).toEqual({ count: 3 })
    })

    it('should delete task even if no task details exist', async () => {
      prismaMock.task.delete.mockResolvedValue({ id: 'task-1' } as any)
      prismaMock.taskDetail.deleteMany.mockResolvedValue({ count: 0 } as any)

      const result = await taskDal.remove('task-1')

      expect(result.count).toBe(0)
      expect(prismaMock.task.delete).toHaveBeenCalled()
      expect(prismaMock.taskDetail.deleteMany).toHaveBeenCalled()
    })

    it('should delete all associated task details', async () => {
      prismaMock.task.delete.mockResolvedValue({} as any)
      prismaMock.taskDetail.deleteMany.mockResolvedValue({ count: 5 } as any)

      await taskDal.remove('task-1')

      expect(prismaMock.taskDetail.deleteMany).toHaveBeenCalledWith({
        where: { task: 'task-1' }
      })
    })
  })
})
