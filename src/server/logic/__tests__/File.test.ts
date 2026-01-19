import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

// Mock dependencies
const mockApp = {
  getPath: vi.fn(() => '/mock/userdata')
}

const mockFs = {
  existsSync: vi.fn(),
  lstatSync: vi.fn(),
  rmSync: vi.fn(),
  unlinkSync: vi.fn()
}

vi.mock('electron', () => ({
  app: mockApp
}))

vi.mock('electron-is-dev', () => ({
  default: false
}))

vi.mock('fs', () => ({
  default: mockFs
}))

vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return actual
})

describe('File Logic', () => {
  let fileLogic: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset electron-is-dev mock
    vi.resetModules()
  })

  describe('getUploadDir', () => {
    it('should return dev directory when in development mode', async () => {
      vi.doMock('electron-is-dev', () => ({
        default: true
      }))

      const module = await import('../File.js')
      const result = module.default.getUploadDir()

      expect(result).toContain('files')
      expect(result).toContain(process.cwd())
    })

    it('should return production directory when in production mode', async () => {
      vi.doMock('electron-is-dev', () => ({
        default: false
      }))

      mockApp.getPath.mockReturnValue('/app/userdata')

      const module = await import('../File.js')
      const result = module.default.getUploadDir()

      expect(mockApp.getPath).toHaveBeenCalledWith('userData')
      expect(result).toBe(path.join('/app/userdata', 'files'))
    })

    it('should call app.getPath with userData in production', async () => {
      vi.doMock('electron-is-dev', () => ({
        default: false
      }))

      const module = await import('../File.js')
      module.default.getUploadDir()

      expect(mockApp.getPath).toHaveBeenCalledWith('userData')
    })
  })

  describe('deleteTaskFiles', () => {
    beforeEach(async () => {
      vi.doMock('electron-is-dev', () => ({
        default: false
      }))
      mockApp.getPath.mockReturnValue('/mock/userdata')

      const module = await import('../File.js')
      fileLogic = module.default
    })

    it('should delete directory recursively when path is a directory', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => true
      })

      fileLogic.deleteTaskFiles('task-123')

      expect(mockFs.existsSync).toHaveBeenCalled()
      expect(mockFs.lstatSync).toHaveBeenCalled()
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('task-123'),
        { recursive: true, force: true }
      )
      expect(mockFs.unlinkSync).not.toHaveBeenCalled()
    })

    it('should delete file when path is a file', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false
      })

      fileLogic.deleteTaskFiles('task-456')

      expect(mockFs.existsSync).toHaveBeenCalled()
      expect(mockFs.lstatSync).toHaveBeenCalled()
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('task-456')
      )
      expect(mockFs.rmSync).not.toHaveBeenCalled()
    })

    it('should do nothing when path does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      fileLogic.deleteTaskFiles('non-existent-task')

      expect(mockFs.existsSync).toHaveBeenCalled()
      expect(mockFs.lstatSync).not.toHaveBeenCalled()
      expect(mockFs.rmSync).not.toHaveBeenCalled()
      expect(mockFs.unlinkSync).not.toHaveBeenCalled()
    })

    it('should construct correct path for task files', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => true
      })

      fileLogic.deleteTaskFiles('task-789')

      const expectedPath = path.join('/mock/userdata', 'files', 'task-789')
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath)
    })

    it('should handle special characters in task ID', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => true
      })

      const taskId = 'task-with-special-chars-!@#'
      fileLogic.deleteTaskFiles(taskId)

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining(taskId)
      )
    })
  })
})
