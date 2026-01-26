import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockTaskRepository = {
  findById: vi.fn()
}

const mockFileLogic = {
  getUploadDir: vi.fn()
}

const mockDialog = {
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn()
}

const mockFs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn()
}

const mockPath = {
  join: vi.fn((...args: string[]) => args.join('/')),
  basename: vi.fn((p: string) => p.split('/').pop() || '')
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  dialog: mockDialog
}))

vi.mock('path', () => ({
  default: mockPath
}))

vi.mock('fs', () => ({
  default: mockFs
}))

vi.mock('../../../../core/domain/repositories/TaskRepository.js', () => ({
  default: mockTaskRepository
}))

vi.mock('../../../../core/infrastructure/services/FileService.js', () => ({
  default: mockFileLogic
}))

vi.mock('../../../../core/infrastructure/adapters/split/index.js', () => ({
  ImagePathUtil: {
    getPath: vi.fn((taskId: string, page: number) => `/uploads/${taskId}/split/page-${page}.png`)
  }
}))

vi.mock('../../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    FILE: {
      GET_IMAGE_PATH: 'file:getImagePath',
      DOWNLOAD_MARKDOWN: 'file:downloadMarkdown',
      SELECT_DIALOG: 'file:selectDialog',
      UPLOAD: 'file:upload',
      UPLOAD_MULTIPLE: 'file:uploadMultiple',
      UPLOAD_FILE_CONTENT: 'file:uploadFileContent'
    }
  }
}))

describe('File Handler', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    mockFileLogic.getUploadDir.mockReturnValue('/uploads')
    mockFs.statSync.mockReturnValue({ size: 1024 })
    mockFs.existsSync.mockReturnValue(true)

    const { registerFileHandlers } = await import('../file.handler.js')
    registerFileHandlers()
  })

  describe('file:getImagePath', () => {
    it('should return image path and exists status', async () => {
      mockFs.existsSync.mockReturnValue(true)

      const handler = handlers.get('file:getImagePath')
      const result = await handler!({}, 'task-1', 5)

      expect(result).toEqual({
        success: true,
        data: {
          imagePath: '/uploads/task-1/split/page-5.png',
          exists: true
        }
      })
    })

    it('should indicate when image does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const handler = handlers.get('file:getImagePath')
      const result = await handler!({}, 'task-1', 5)

      expect(result.data.exists).toBe(false)
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('file:getImagePath')
      const result = await handler!({}, '', 1)

      expect(result).toEqual({
        success: false,
        error: 'Task ID is required'
      })
    })

    it('should return error when page is invalid', async () => {
      const handler = handlers.get('file:getImagePath')
      const result = await handler!({}, 'task-1', 0)

      expect(result).toEqual({
        success: false,
        error: 'Page number must be greater than 0'
      })
    })
  })

  describe('file:downloadMarkdown', () => {
    it('should download merged file successfully', async () => {
      const mockTask = {
        id: 'task-1',
        filename: 'document.pdf',
        merged_path: '/uploads/task-1/merged.md'
      }
      mockTaskRepository.findById.mockResolvedValue(mockTask)
      mockFs.existsSync.mockReturnValue(true)
      mockDialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/downloads/document.md'
      })

      const handler = handlers.get('file:downloadMarkdown')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: true,
        data: { savedPath: '/downloads/document.md' }
      })
      expect(mockFs.copyFileSync).toHaveBeenCalledWith(
        '/uploads/task-1/merged.md',
        '/downloads/document.md'
      )
    })

    it('should return error when task not found', async () => {
      mockTaskRepository.findById.mockResolvedValue(null)

      const handler = handlers.get('file:downloadMarkdown')
      const result = await handler!({}, 'non-existent')

      expect(result).toEqual({
        success: false,
        error: 'Task not found'
      })
    })

    it('should return error when merged_path is missing', async () => {
      mockTaskRepository.findById.mockResolvedValue({ id: 'task-1', merged_path: null })

      const handler = handlers.get('file:downloadMarkdown')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: false,
        error: 'Merged file does not exist, task may not be completed'
      })
    })

    it('should return error when user cancels save dialog', async () => {
      mockTaskRepository.findById.mockResolvedValue({
        id: 'task-1',
        filename: 'test.pdf',
        merged_path: '/path/merged.md'
      })
      mockDialog.showSaveDialog.mockResolvedValue({
        canceled: true,
        filePath: undefined
      })

      const handler = handlers.get('file:downloadMarkdown')
      const result = await handler!({}, 'task-1')

      expect(result).toEqual({
        success: false,
        error: 'User cancelled save'
      })
    })
  })

  describe('file:selectDialog', () => {
    it('should return selected file paths', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        filePaths: ['/path/to/file1.pdf', '/path/to/file2.pdf'],
        canceled: false
      })

      const handler = handlers.get('file:selectDialog')
      const result = await handler!({})

      expect(result).toEqual({
        success: true,
        data: {
          filePaths: ['/path/to/file1.pdf', '/path/to/file2.pdf'],
          canceled: false
        }
      })
    })

    it('should handle canceled dialog', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        filePaths: [],
        canceled: true
      })

      const handler = handlers.get('file:selectDialog')
      const result = await handler!({})

      expect(result.data.canceled).toBe(true)
      expect(result.data.filePaths).toEqual([])
    })

    it('should use correct file filters', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        filePaths: [],
        canceled: true
      })

      const handler = handlers.get('file:selectDialog')
      await handler!({})

      expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: ['openFile', 'multiSelections'],
          filters: expect.arrayContaining([
            expect.objectContaining({
              name: 'All Supported Files',
              extensions: expect.arrayContaining([
                'pdf', 'jpg', 'jpeg', 'png', 'webp',
                'docx', 'dotx', 'pptx', 'potx', 'xlsx', 'xltx', 'csv'
              ])
            })
          ])
        })
      )
    })
  })

  describe('file:upload', () => {
    it('should upload file successfully', async () => {
      mockFs.existsSync.mockReturnValue(true)

      const handler = handlers.get('file:upload')
      const result = await handler!({}, 'task-123', '/source/document.pdf')

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        originalName: 'document.pdf',
        taskId: 'task-123',
        size: 1024
      })
      expect(mockFs.copyFileSync).toHaveBeenCalled()
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('file:upload')
      const result = await handler!({}, '', '/file.pdf')

      expect(result).toEqual({
        success: false,
        error: 'Task ID and file path are required'
      })
    })

    it('should return error when filePath is missing', async () => {
      const handler = handlers.get('file:upload')
      const result = await handler!({}, 'task-1', '')

      expect(result).toEqual({
        success: false,
        error: 'Task ID and file path are required'
      })
    })

    it('should return error when file does not exist', async () => {
      mockFs.existsSync.mockReturnValueOnce(false)

      const handler = handlers.get('file:upload')
      const result = await handler!({}, 'task-1', '/non-existent.pdf')

      expect(result).toEqual({
        success: false,
        error: 'File does not exist'
      })
    })

    it('should create upload directory if not exists', async () => {
      mockFs.existsSync
        .mockReturnValueOnce(true)  // source file exists
        .mockReturnValueOnce(false) // upload dir doesn't exist

      const handler = handlers.get('file:upload')
      await handler!({}, 'task-1', '/source/file.pdf')

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('task-1'),
        { recursive: true }
      )
    })
  })

  describe('file:uploadMultiple', () => {
    it('should upload multiple files successfully', async () => {
      mockFs.existsSync.mockReturnValue(true)

      const handler = handlers.get('file:uploadMultiple')
      const result = await handler!({}, 'task-123', ['/file1.pdf', '/file2.pdf'])

      expect(result.success).toBe(true)
      expect(result.data.files).toHaveLength(2)
      expect(mockFs.copyFileSync).toHaveBeenCalledTimes(2)
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('file:uploadMultiple')
      const result = await handler!({}, '', ['/file.pdf'])

      expect(result).toEqual({
        success: false,
        error: 'Task ID and file path list are required'
      })
    })

    it('should return error when filePaths is empty', async () => {
      const handler = handlers.get('file:uploadMultiple')
      const result = await handler!({}, 'task-1', [])

      expect(result).toEqual({
        success: false,
        error: 'Task ID and file path list are required'
      })
    })

    it('should skip non-existent files', async () => {
      mockFs.existsSync
        .mockReturnValueOnce(true)  // file1 exists
        .mockReturnValueOnce(true)  // upload dir check
        .mockReturnValueOnce(false) // file2 doesn't exist

      const handler = handlers.get('file:uploadMultiple')
      const result = await handler!({}, 'task-1', ['/file1.pdf', '/non-existent.pdf'])

      expect(result.success).toBe(true)
      expect(result.data.files).toHaveLength(1)
    })
  })

  describe('file:uploadFileContent', () => {
    it('should save file content successfully', async () => {
      const fileBuffer = new ArrayBuffer(8)

      const handler = handlers.get('file:uploadFileContent')
      const result = await handler!({}, 'task-123', 'document.pdf', fileBuffer)

      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        originalName: 'document.pdf',
        taskId: 'task-123'
      })
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('should return error when taskId is missing', async () => {
      const handler = handlers.get('file:uploadFileContent')
      const result = await handler!({}, '', 'file.pdf', new ArrayBuffer(8))

      expect(result).toEqual({
        success: false,
        error: 'Task ID, file name, and file content are required'
      })
    })

    it('should return error when fileName is missing', async () => {
      const handler = handlers.get('file:uploadFileContent')
      const result = await handler!({}, 'task-1', '', new ArrayBuffer(8))

      expect(result).toEqual({
        success: false,
        error: 'Task ID, file name, and file content are required'
      })
    })

    it('should return error when fileBuffer is missing', async () => {
      const handler = handlers.get('file:uploadFileContent')
      const result = await handler!({}, 'task-1', 'file.pdf', null)

      expect(result).toEqual({
        success: false,
        error: 'Task ID, file name, and file content are required'
      })
    })

    it('should create directory if not exists', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const handler = handlers.get('file:uploadFileContent')
      await handler!({}, 'task-1', 'file.pdf', new ArrayBuffer(8))

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('task-1'),
        { recursive: true }
      )
    })
  })
})
