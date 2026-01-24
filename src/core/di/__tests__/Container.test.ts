import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock all dependencies before imports
vi.mock('../../db/index.js', () => ({
  prisma: { task: {}, taskDetail: {}, provider: {}, model: {} }
}))

vi.mock('../../events/EventBus.js', () => ({
  eventBus: {
    emitTaskEvent: vi.fn(),
    onTaskEvent: vi.fn()
  }
}))

vi.mock('../../services/WorkerOrchestrator.js', () => ({
  WorkerOrchestrator: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(),
    getWorkerInfo: vi.fn(),
    cleanupOrphanedWork: vi.fn()
  }))
}))

vi.mock('../../repositories/ProviderRepository.js', () => ({
  default: { findAll: vi.fn(), findById: vi.fn() }
}))

vi.mock('../../repositories/ModelRepository.js', () => ({
  default: { findAll: vi.fn(), findByProviderId: vi.fn() }
}))

vi.mock('../../repositories/TaskRepository.js', () => ({
  default: { findAll: vi.fn(), create: vi.fn() }
}))

vi.mock('../../repositories/TaskDetailRepository.js', () => ({
  default: { findByTaskId: vi.fn(), findByTaskAndPage: vi.fn() }
}))

vi.mock('../../logic/File.js', () => ({
  default: { getUploadDir: vi.fn(() => '/uploads') }
}))

vi.mock('../../logic/Model.js', () => ({
  default: { completion: vi.fn() }
}))

describe('Container', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Reset container after each test
    const { resetContainer } = await import('../Container.js')
    resetContainer()
  })

  describe('createContainer', () => {
    it('should return a container object with all dependencies', async () => {
      const { createContainer } = await import('../Container.js')

      const container = createContainer()

      expect(container).toBeDefined()
      expect(container.prisma).toBeDefined()
      expect(container.eventBus).toBeDefined()
    })

    it('should include repositories in container', async () => {
      const { createContainer } = await import('../Container.js')

      const container = createContainer()

      expect(container.providerRepository).toBeDefined()
      expect(container.modelRepository).toBeDefined()
      expect(container.taskRepository).toBeDefined()
      expect(container.taskDetailRepository).toBeDefined()
    })

    it('should include services in container', async () => {
      const { createContainer } = await import('../Container.js')

      const container = createContainer()

      expect(container.fileService).toBeDefined()
      expect(container.modelService).toBeDefined()
      expect(container.workerOrchestrator).toBeDefined()
    })

    it('should create a new WorkerOrchestrator instance', async () => {
      const { WorkerOrchestrator } = await import('../../services/WorkerOrchestrator.js')
      const { createContainer } = await import('../Container.js')

      createContainer()

      expect(WorkerOrchestrator).toHaveBeenCalled()
    })

    it('should accept optional config parameter', async () => {
      const { createContainer } = await import('../Container.js')

      const config = { uploadsDir: '/custom/uploads' }
      const container = createContainer(config)

      expect(container).toBeDefined()
    })
  })

  describe('getContainer', () => {
    it('should return singleton container instance', async () => {
      const { getContainer, resetContainer } = await import('../Container.js')
      resetContainer()

      const container1 = getContainer()
      const container2 = getContainer()

      expect(container1).toBe(container2)
    })

    it('should create container on first call if not exists', async () => {
      const { getContainer, resetContainer } = await import('../Container.js')
      resetContainer()

      const container = getContainer()

      expect(container).toBeDefined()
      expect(container.prisma).toBeDefined()
    })

    it('should return the same container on subsequent calls', async () => {
      const { getContainer, resetContainer } = await import('../Container.js')
      resetContainer()

      const first = getContainer()
      const second = getContainer()
      const third = getContainer()

      expect(first).toBe(second)
      expect(second).toBe(third)
    })
  })

  describe('setContainer', () => {
    it('should allow replacing container with custom instance', async () => {
      const { setContainer, getContainer, resetContainer } = await import('../Container.js')
      resetContainer()

      const customContainer = {
        prisma: { custom: true },
        eventBus: { custom: true },
        providerRepository: {},
        modelRepository: {},
        taskRepository: {},
        taskDetailRepository: {},
        fileService: {},
        modelService: {},
        workerOrchestrator: {}
      } as any

      setContainer(customContainer)
      const container = getContainer()

      expect(container).toBe(customContainer)
    })

    it('should be useful for testing with mocked dependencies', async () => {
      const { setContainer, getContainer, resetContainer } = await import('../Container.js')
      resetContainer()

      const mockPrisma = { task: { findMany: vi.fn() } }
      const testContainer = {
        prisma: mockPrisma,
        eventBus: {},
        providerRepository: {},
        modelRepository: {},
        taskRepository: {},
        taskDetailRepository: {},
        fileService: {},
        modelService: {},
        workerOrchestrator: {}
      } as any

      setContainer(testContainer)
      const container = getContainer()

      expect(container.prisma).toBe(mockPrisma)
    })
  })

  describe('resetContainer', () => {
    it('should clear the singleton instance', async () => {
      const { getContainer, resetContainer } = await import('../Container.js')

      const containerBefore = getContainer()
      resetContainer()
      const containerAfter = getContainer()

      expect(containerBefore).not.toBe(containerAfter)
    })

    it('should allow creating a new container after reset', async () => {
      const { getContainer, resetContainer, setContainer } = await import('../Container.js')

      const customContainer = { custom: true } as any
      setContainer(customContainer)

      resetContainer()
      const newContainer = getContainer()

      expect(newContainer).not.toBe(customContainer)
      expect(newContainer.prisma).toBeDefined()
    })

    it('should be useful for test isolation', async () => {
      const { getContainer, resetContainer, setContainer } = await import('../Container.js')

      // Test 1: Set custom container
      setContainer({ test1: true } as any)
      expect(getContainer()).toEqual({ test1: true })

      resetContainer()

      // Test 2: Should get fresh container
      const freshContainer = getContainer()
      expect((freshContainer as any).test1).toBeUndefined()
    })
  })

  describe('default export', () => {
    it('should export all container functions', async () => {
      const containerModule = await import('../Container.js')

      expect(containerModule.default).toBeDefined()
      expect(containerModule.default.createContainer).toBeDefined()
      expect(containerModule.default.getContainer).toBeDefined()
      expect(containerModule.default.setContainer).toBeDefined()
      expect(containerModule.default.resetContainer).toBeDefined()
    })
  })
})
