import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockModelLogic = {
  completion: vi.fn()
}

const mockIpcMain = {
  handle: vi.fn()
}

// Mock modules
vi.mock('electron', () => ({
  ipcMain: mockIpcMain
}))

vi.mock('../../../../core/application/services/ModelService.js', () => ({
  default: mockModelLogic
}))

vi.mock('../../../../shared/ipc/channels.js', () => ({
  IPC_CHANNELS: {
    COMPLETION: {
      MARK_IMAGEDOWN: 'completion:markImagedown',
      TEST_CONNECTION: 'completion:testConnection'
    }
  }
}))

describe('Completion Handler', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    const { registerCompletionHandlers } = await import('../completion.handler.js')
    registerCompletionHandlers()
  })

  describe('completion:markImagedown', () => {
    it('should convert image to markdown successfully', async () => {
      const mockResult = { content: '# Converted Markdown\n\nThis is the converted content.' }
      mockModelLogic.completion.mockResolvedValue(mockResult)

      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, 1, 'gpt-4o', 'data:image/png;base64,abc123')

      expect(result).toEqual({
        success: true,
        data: mockResult
      })
      expect(mockModelLogic.completion).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'image_url',
                  image_url: { url: 'data:image/png;base64,abc123' }
                }),
                expect.objectContaining({
                  type: 'text',
                  text: 'Convert this image to markdown.'
                })
              ])
            })
          ])
        })
      )
    })

    it('should return error when providerId is missing', async () => {
      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, null, 'gpt-4o', 'data:image/png;base64,abc')

      expect(result).toEqual({
        success: false,
        error: 'providerId, modelId, and url are required'
      })
    })

    it('should return error when modelId is missing', async () => {
      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, 1, null, 'data:image/png;base64,abc')

      expect(result).toEqual({
        success: false,
        error: 'providerId, modelId, and url are required'
      })
    })

    it('should return error when url is missing', async () => {
      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, 1, 'gpt-4o', null)

      expect(result).toEqual({
        success: false,
        error: 'providerId, modelId, and url are required'
      })
    })

    it('should return error when url is empty string', async () => {
      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, 1, 'gpt-4o', '')

      expect(result).toEqual({
        success: false,
        error: 'providerId, modelId, and url are required'
      })
    })

    it('should handle LLM API errors', async () => {
      mockModelLogic.completion.mockRejectedValue(new Error('API rate limit exceeded'))

      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, 1, 'gpt-4o', 'data:image/png;base64,abc')

      expect(result).toEqual({
        success: false,
        error: 'API rate limit exceeded'
      })
    })

    it('should handle network errors', async () => {
      mockModelLogic.completion.mockRejectedValue(new Error('Network error'))

      const handler = handlers.get('completion:markImagedown')
      const result = await handler!({}, 1, 'gpt-4o', 'data:image/png;base64,abc')

      expect(result).toEqual({
        success: false,
        error: 'Network error'
      })
    })
  })

  describe('completion:testConnection', () => {
    it('should test connection successfully', async () => {
      const mockResult = { content: 'This is a test image.' }
      mockModelLogic.completion.mockResolvedValue(mockResult)

      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, 1, 'gpt-4o')

      expect(result).toEqual({
        success: true,
        data: mockResult
      })
    })

    it('should use test image for connection test', async () => {
      mockModelLogic.completion.mockResolvedValue({ content: 'Test' })

      const handler = handlers.get('completion:testConnection')
      await handler!({}, 1, 'gpt-4o')

      expect(mockModelLogic.completion).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'image_url',
                  image_url: expect.objectContaining({
                    url: expect.stringContaining('data:image/png;base64,')
                  })
                }),
                expect.objectContaining({
                  type: 'text',
                  text: 'Test connection.'
                })
              ])
            })
          ])
        })
      )
    })

    it('should return error when providerId is missing', async () => {
      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, null, 'gpt-4o')

      expect(result).toEqual({
        success: false,
        error: 'providerId and modelId are required'
      })
    })

    it('should return error when modelId is missing', async () => {
      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, 1, null)

      expect(result).toEqual({
        success: false,
        error: 'providerId and modelId are required'
      })
    })

    it('should return error when modelId is empty string', async () => {
      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, 1, '')

      expect(result).toEqual({
        success: false,
        error: 'providerId and modelId are required'
      })
    })

    it('should handle connection failure', async () => {
      mockModelLogic.completion.mockRejectedValue(new Error('Connection refused'))

      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, 1, 'gpt-4o')

      expect(result).toEqual({
        success: false,
        error: 'Connection refused'
      })
    })

    it('should handle invalid API key', async () => {
      mockModelLogic.completion.mockRejectedValue(new Error('Invalid API key'))

      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, 1, 'gpt-4o')

      expect(result).toEqual({
        success: false,
        error: 'Invalid API key'
      })
    })

    it('should handle timeout errors', async () => {
      mockModelLogic.completion.mockRejectedValue(new Error('Request timeout'))

      const handler = handlers.get('completion:testConnection')
      const result = await handler!({}, 1, 'gpt-4o')

      expect(result).toEqual({
        success: false,
        error: 'Request timeout'
      })
    })
  })
})
