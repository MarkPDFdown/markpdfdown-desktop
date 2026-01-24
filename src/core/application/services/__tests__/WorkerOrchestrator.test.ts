import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReset, DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import { TaskStatus } from '../../../../shared/types/TaskStatus.js'
import { PageStatus } from '../../../../shared/types/PageStatus.js'

// Mock prisma module
vi.mock('../../../infrastructure/db/index.js', async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return {
    prisma: mockDeep()
  }
})

// Mock workers
const mockSplitterWorker = {
  run: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  getWorkerId: vi.fn().mockReturnValue('splitter-123'),
  getIsRunning: vi.fn().mockReturnValue(true)
}

const mockConverterWorker = {
  run: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  getWorkerId: vi.fn().mockReturnValue('converter-123'),
  getIsRunning: vi.fn().mockReturnValue(true)
}

const mockMergerWorker = {
  run: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  getWorkerId: vi.fn().mockReturnValue('merger-123'),
  getIsRunning: vi.fn().mockReturnValue(true)
}

vi.mock('../../workers/index.js', () => ({
  SplitterWorker: vi.fn().mockImplementation(() => mockSplitterWorker),
  ConverterWorker: vi.fn().mockImplementation(() => mockConverterWorker),
  MergerWorker: vi.fn().mockImplementation(() => mockMergerWorker)
}))

vi.mock('../../../domain/split/index.js', () => ({
  ImagePathUtil: {
    init: vi.fn()
  }
}))

vi.mock('../../../infrastructure/services/FileService.js', () => ({
  default: {
    getUploadDir: vi.fn().mockReturnValue('/mock/uploads')
  }
}))

vi.mock('../../../infrastructure/config/worker.config.js', () => ({
  WORKER_CONFIG: {
    converter: {
      count: 3
    }
  }
}))

import { WorkerOrchestrator } from '../WorkerOrchestrator.js'
import { SplitterWorker, ConverterWorker, MergerWorker } from '../../workers/index.js'
import { ImagePathUtil } from '../../../domain/split/index.js'
import { prisma } from '../../../infrastructure/db/index.js'

// Cast to mock type for type safety
const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

describe('WorkerOrchestrator', () => {
  let orchestrator: WorkerOrchestrator

  beforeEach(() => {
    vi.clearAllMocks()
    mockReset(prismaMock)
    orchestrator = new WorkerOrchestrator()

    // Default: no orphaned work
    prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 0 } as any)
    prismaMock.task.updateMany.mockResolvedValue({ count: 0 } as any)
  })

  afterEach(() => {
    // Ensure workers are stopped
    if (orchestrator.getStatus()) {
      orchestrator.stop()
    }
  })

  describe('constructor', () => {
    it('should initialize with isRunning = false', () => {
      const newOrchestrator = new WorkerOrchestrator()
      expect(newOrchestrator.getStatus()).toBe(false)
    })

    it('should initialize with empty worker references', () => {
      const newOrchestrator = new WorkerOrchestrator()
      const info = newOrchestrator.getWorkerInfo()

      expect(info.splitterWorker).toBeNull()
      expect(info.converterWorkers).toEqual([])
      expect(info.mergerWorker).toBeNull()
    })
  })

  describe('start', () => {
    it('should start all workers successfully', async () => {
      await orchestrator.start()

      expect(orchestrator.getStatus()).toBe(true)
      expect(SplitterWorker).toHaveBeenCalledWith('/mock/uploads')
      expect(ConverterWorker).toHaveBeenCalled()
      expect(MergerWorker).toHaveBeenCalledWith('/mock/uploads')
    })

    it('should initialize ImagePathUtil with uploads directory', async () => {
      await orchestrator.start()

      expect(ImagePathUtil.init).toHaveBeenCalledWith('/mock/uploads')
    })

    it('should create configured number of ConverterWorkers', async () => {
      await orchestrator.start()

      // WORKER_CONFIG.converter.count is mocked to 3
      expect(ConverterWorker).toHaveBeenCalledTimes(3)
    })

    it('should print warning and return when already running', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await orchestrator.start()
      await orchestrator.start() // Second call should warn

      expect(consoleSpy).toHaveBeenCalledWith('[WorkerOrchestrator] Workers already running')
      consoleSpy.mockRestore()
    })

    it('should call cleanupOrphanedWork before starting workers', async () => {
      const cleanupSpy = vi.spyOn(orchestrator, 'cleanupOrphanedWork')

      await orchestrator.start()

      expect(cleanupSpy).toHaveBeenCalled()
    })

    it('should run splitter worker', async () => {
      await orchestrator.start()

      expect(mockSplitterWorker.run).toHaveBeenCalled()
    })

    it('should run all converter workers', async () => {
      await orchestrator.start()

      expect(mockConverterWorker.run).toHaveBeenCalledTimes(3)
    })

    it('should run merger worker', async () => {
      await orchestrator.start()

      expect(mockMergerWorker.run).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('should stop all workers', async () => {
      await orchestrator.start()
      await orchestrator.stop()

      expect(orchestrator.getStatus()).toBe(false)
      expect(mockSplitterWorker.stop).toHaveBeenCalled()
      expect(mockMergerWorker.stop).toHaveBeenCalled()
    })

    it('should print warning when not running', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await orchestrator.stop() // Call stop without starting

      expect(consoleSpy).toHaveBeenCalledWith('[WorkerOrchestrator] Workers not running')
      consoleSpy.mockRestore()
    })

    it('should clear worker references after stopping', async () => {
      await orchestrator.start()
      await orchestrator.stop()

      const info = orchestrator.getWorkerInfo()
      expect(info.splitterWorker).toBeNull()
      expect(info.converterWorkers).toEqual([])
      expect(info.mergerWorker).toBeNull()
    })
  })

  describe('getStatus', () => {
    it('should return false when not started', () => {
      expect(orchestrator.getStatus()).toBe(false)
    })

    it('should return true when running', async () => {
      await orchestrator.start()

      expect(orchestrator.getStatus()).toBe(true)
    })

    it('should return false after stopping', async () => {
      await orchestrator.start()
      await orchestrator.stop()

      expect(orchestrator.getStatus()).toBe(false)
    })
  })

  describe('getWorkerInfo', () => {
    it('should return worker status information when running', async () => {
      await orchestrator.start()

      const info = orchestrator.getWorkerInfo()

      expect(info.isRunning).toBe(true)
      expect(info.splitterWorker).toBeDefined()
      expect(info.splitterWorker?.id).toBe('splitter-123')
      expect(info.converterWorkers).toHaveLength(3)
      expect(info.mergerWorker).toBeDefined()
      expect(info.directories.uploads).toBe('/mock/uploads')
    })

    it('should return null workers when not running', () => {
      const info = orchestrator.getWorkerInfo()

      expect(info.isRunning).toBe(false)
      expect(info.splitterWorker).toBeNull()
      expect(info.converterWorkers).toEqual([])
      expect(info.mergerWorker).toBeNull()
    })

    it('should include running status for each worker', async () => {
      await orchestrator.start()

      const info = orchestrator.getWorkerInfo()

      expect(info.splitterWorker?.running).toBe(true)
      expect(info.mergerWorker?.running).toBe(true)
      info.converterWorkers.forEach(worker => {
        expect(worker.running).toBe(true)
      })
    })
  })

  describe('cleanupOrphanedWork', () => {
    it('should reset PROCESSING pages to PENDING', async () => {
      prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 5 } as any)
      prismaMock.task.updateMany.mockResolvedValue({ count: 0 } as any)

      const result = await orchestrator.cleanupOrphanedWork()

      expect(prismaMock.taskDetail.updateMany).toHaveBeenCalledWith({
        where: {
          status: PageStatus.PROCESSING,
          worker_id: { not: null }
        },
        data: {
          status: PageStatus.PENDING,
          worker_id: null,
          started_at: null
        }
      })
      expect(result.orphanedPages).toBe(5)
    })

    it('should reset SPLITTING tasks to PENDING', async () => {
      prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 0 } as any)
      prismaMock.task.updateMany
        .mockResolvedValueOnce({ count: 2 } as any) // SPLITTING -> PENDING
        .mockResolvedValueOnce({ count: 0 } as any)  // MERGING -> READY_TO_MERGE

      const result = await orchestrator.cleanupOrphanedWork()

      expect(prismaMock.task.updateMany).toHaveBeenCalledWith({
        where: {
          status: TaskStatus.SPLITTING,
          worker_id: { not: null }
        },
        data: {
          status: TaskStatus.PENDING,
          worker_id: null
        }
      })
      expect(result.orphanedSplittingTasks).toBe(2)
    })

    it('should reset MERGING tasks to READY_TO_MERGE', async () => {
      prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 0 } as any)
      prismaMock.task.updateMany
        .mockResolvedValueOnce({ count: 0 } as any) // SPLITTING -> PENDING
        .mockResolvedValueOnce({ count: 3 } as any)  // MERGING -> READY_TO_MERGE

      const result = await orchestrator.cleanupOrphanedWork()

      expect(prismaMock.task.updateMany).toHaveBeenCalledWith({
        where: {
          status: TaskStatus.MERGING,
          worker_id: { not: null }
        },
        data: {
          status: TaskStatus.READY_TO_MERGE,
          worker_id: null
        }
      })
      expect(result.orphanedMergingTasks).toBe(3)
    })

    it('should return total=0 when no orphaned work', async () => {
      prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 0 } as any)
      prismaMock.task.updateMany.mockResolvedValue({ count: 0 } as any)

      const result = await orchestrator.cleanupOrphanedWork()

      expect(result.total).toBe(0)
      expect(result.orphanedPages).toBe(0)
      expect(result.orphanedSplittingTasks).toBe(0)
      expect(result.orphanedMergingTasks).toBe(0)
    })

    it('should return sum of all orphaned items as total', async () => {
      prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 5 } as any)
      prismaMock.task.updateMany
        .mockResolvedValueOnce({ count: 2 } as any)
        .mockResolvedValueOnce({ count: 3 } as any)

      const result = await orchestrator.cleanupOrphanedWork()

      expect(result.total).toBe(10) // 5 + 2 + 3
    })

    it('should return empty result on error without interrupting startup', async () => {
      prismaMock.taskDetail.updateMany.mockRejectedValue(new Error('Database error'))

      const result = await orchestrator.cleanupOrphanedWork()

      expect(result).toEqual({
        orphanedPages: 0,
        orphanedSplittingTasks: 0,
        orphanedMergingTasks: 0,
        total: 0
      })
    })

    it('should log cleanup results', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      prismaMock.taskDetail.updateMany.mockResolvedValue({ count: 2 } as any)
      prismaMock.task.updateMany.mockResolvedValue({ count: 0 } as any)

      await orchestrator.cleanupOrphanedWork()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reset 2 orphaned pages to PENDING')
      )
      consoleSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('should handle worker start errors gracefully', async () => {
      const error = new Error('Worker failed to start')
      vi.mocked(SplitterWorker).mockImplementationOnce(() => {
        throw error
      })

      await expect(orchestrator.start()).rejects.toThrow('Worker failed to start')
      expect(orchestrator.getStatus()).toBe(false)
    })
  })
})
