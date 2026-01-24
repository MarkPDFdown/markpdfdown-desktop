import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockProviderDal = {
  findById: vi.fn()
}

const mockLLMClientFactory = {
  createClient: vi.fn()
}

const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from('mock-image-data'))
const mockSharp = vi.fn(() => ({
  toBuffer: mockToBuffer
}))

vi.mock('../../dal/ProviderDal.js', () => ({
  default: mockProviderDal
}))

vi.mock('../llm/LLMClient.js', () => ({
  LLMClientFactory: mockLLMClientFactory
}))

vi.mock('sharp', () => ({
  default: mockSharp
}))

describe('Model Logic', () => {
  let modelLogic: any

  beforeEach(async () => {
    vi.clearAllMocks()
    mockToBuffer.mockClear()
    const module = await import('../Model.js')
    modelLogic = module.default
  })

  describe('getLLMClient', () => {
    it('should throw error when provider does not exist', async () => {
      mockProviderDal.findById.mockResolvedValue(null)

      // Test through completion since getLLMClient is private
      await expect(
        modelLogic.completion(999, { messages: [] })
      ).rejects.toThrow('服务商不存在')
    })

    it('should create OpenAI client with correct parameters', async () => {
      const mockProvider = {
        id: 1,
        type: 'openai',
        api_key: 'sk-test-key',
        base_url: 'https://api.openai.com/v1',
        suffix: ''
      }

      const mockClient = {
        completion: vi.fn().mockResolvedValue({ content: 'test' })
      }

      mockProviderDal.findById.mockResolvedValue(mockProvider)
      mockLLMClientFactory.createClient.mockResolvedValue(mockClient)

      // Test through completion
      await modelLogic.completion(1, {
        messages: [],
        model: 'gpt-4'
      })

      expect(mockProviderDal.findById).toHaveBeenCalledWith(1)
      expect(mockLLMClientFactory.createClient).toHaveBeenCalledWith(
        'openai',
        'sk-test-key',
        'https://api.openai.com/v1/chat/completions'
      )
    })

    it('should use default base_url for ollama when not provided', async () => {
      const mockProvider = {
        id: 2,
        type: 'ollama',
        api_key: '',
        base_url: '',
        suffix: ''
      }

      const mockClient = {
        completion: vi.fn().mockResolvedValue({ content: 'response' })
      }

      mockProviderDal.findById.mockResolvedValue(mockProvider)
      mockLLMClientFactory.createClient.mockResolvedValue(mockClient)

      await modelLogic.completion(2, {
        messages: [],
        model: 'llama2'
      })

      expect(mockLLMClientFactory.createClient).toHaveBeenCalledWith(
        'ollama',
        '',
        'http://localhost:11434/api/generate'
      )
    })

    it('should use correct suffix for each provider type', async () => {
      const testCases = [
        { type: 'openai', expectedSuffix: '/chat/completions' },
        { type: 'openai-responses', expectedSuffix: '/responses' },
        { type: 'gemini', expectedSuffix: '/models' },
        { type: 'anthropic', expectedSuffix: '/messages' },
        { type: 'ollama', expectedSuffix: '/generate' }
      ]

      for (const testCase of testCases) {
        const mockProvider = {
          id: 1,
          type: testCase.type,
          api_key: 'test-key',
          base_url: 'https://api.test.com',
          suffix: ''
        }

        const mockClient = {
          completion: vi.fn().mockResolvedValue({ content: 'response' })
        }

        mockProviderDal.findById.mockResolvedValue(mockProvider)
        mockLLMClientFactory.createClient.mockResolvedValue(mockClient)

        await modelLogic.completion(1, {
          messages: [],
          model: 'test-model'
        })

        expect(mockLLMClientFactory.createClient).toHaveBeenCalledWith(
          testCase.type,
          'test-key',
          `https://api.test.com${testCase.expectedSuffix}`
        )
      }
    })

    it('should use custom suffix when provided', async () => {
      const mockProvider = {
        id: 1,
        type: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.custom.com',
        suffix: '/custom/endpoint'
      }

      const mockClient = {
        completion: vi.fn().mockResolvedValue({ content: 'response' })
      }

      mockProviderDal.findById.mockResolvedValue(mockProvider)
      mockLLMClientFactory.createClient.mockResolvedValue(mockClient)

      await modelLogic.completion(1, {
        messages: [],
        model: 'test'
      })

      expect(mockLLMClientFactory.createClient).toHaveBeenCalledWith(
        'openai',
        'test-key',
        'https://api.custom.com/custom/endpoint'
      )
    })
  })

  describe('completion', () => {
    it('should call llmClient.completion with provided options', async () => {
      const mockProvider = {
        id: 1,
        type: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        suffix: ''
      }

      const mockClient = {
        completion: vi.fn().mockResolvedValue({
          content: 'Test response',
          model: 'gpt-4'
        })
      }

      mockProviderDal.findById.mockResolvedValue(mockProvider)
      mockLLMClientFactory.createClient.mockResolvedValue(mockClient)

      const options = {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: 'Hello' }
          }
        ],
        model: 'gpt-4',
        temperature: 0.7
      }

      const result = await modelLogic.completion(1, options)

      expect(mockClient.completion).toHaveBeenCalledWith(options)
      expect(result).toEqual({
        content: 'Test response',
        model: 'gpt-4'
      })
    })

    it('should handle completion errors', async () => {
      const mockProvider = {
        id: 1,
        type: 'openai',
        api_key: 'test-key',
        base_url: '',
        suffix: ''
      }

      const mockClient = {
        completion: vi.fn().mockRejectedValue(new Error('API Error'))
      }

      mockProviderDal.findById.mockResolvedValue(mockProvider)
      mockLLMClientFactory.createClient.mockResolvedValue(mockClient)

      await expect(
        modelLogic.completion(1, { messages: [] })
      ).rejects.toThrow('API Error')
    })
  })

  describe('transformImageMessage', () => {
    it('should create message with system and user roles', async () => {
      const result = await modelLogic.transformImageMessage('/path/to/image.jpg')

      expect(result).toHaveLength(2)
      expect(result[0].role).toBe('system')
      expect(result[1].role).toBe('user')
    })

    it('should include system message with instructions', async () => {
      const result = await modelLogic.transformImageMessage('/path/to/image.jpg')

      const systemMessage = result[0]
      expect(systemMessage.content.type).toBe('text')
      expect(systemMessage.content.text).toContain('helpful assistant')
      expect(systemMessage.content.text).toContain('Markdown')
    })

    it('should include user message with text and image', async () => {
      const result = await modelLogic.transformImageMessage('/path/to/image.jpg')

      const userMessage = result[1]
      expect(Array.isArray(userMessage.content)).toBe(true)
      expect(userMessage.content).toHaveLength(2)

      const [textContent, imageContent] = userMessage.content
      expect(textContent.type).toBe('text')
      expect(imageContent.type).toBe('image_url')
    })

    it('should include detailed transcription instructions', async () => {
      const result = await modelLogic.transformImageMessage('/path/to/image.jpg')

      const userMessage = result[1]
      const textContent = userMessage.content[0]

      expect(textContent.text).toContain('heading levels')
      expect(textContent.text).toContain('LaTeX')
      expect(textContent.text).toContain('table')
      expect(textContent.text).toContain('Markdown')
    })

    it('should create base64 data URL for image', async () => {
      const result = await modelLogic.transformImageMessage('/path/to/image.jpg')

      const userMessage = result[1]
      const imageContent = userMessage.content[1]

      expect(imageContent.image_url.url).toMatch(/^data:image\/jpeg;base64,/)
    })

    it('should call sharp to process image', async () => {
      await modelLogic.transformImageMessage('/path/to/test.jpg')

      expect(mockSharp).toHaveBeenCalledWith('/path/to/test.jpg')
      expect(mockToBuffer).toHaveBeenCalled()
    })

    it('should handle different image paths', async () => {
      const paths = [
        '/absolute/path/image.jpg',
        'relative/path/image.png',
        'C:\\Windows\\path\\image.jpg'
      ]

      for (const imagePath of paths) {
        mockSharp.mockClear()
        await modelLogic.transformImageMessage(imagePath)
        expect(mockSharp).toHaveBeenCalledWith(imagePath)
      }
    })
  })
})
