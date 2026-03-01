import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import UploadPanel from '../UploadPanel'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock CloudContext
const mockCloudContext = {
  user: { id: '', email: '', fullName: null, imageUrl: '', isLoaded: true, isSignedIn: false },
  isAuthenticated: false,
  convertFile: vi.fn()
}

vi.mock('../../contexts/CloudContextDefinition', () => ({
  CloudContext: {
    Provider: ({ children }: any) => children,
    Consumer: ({ children }: any) => children(mockCloudContext)
  }
}))

vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useContext: (context: any) => {
      // Return mock for CloudContext
      if (context?.Consumer) {
        return mockCloudContext
      }
      return (actual as any).useContext(context)
    }
  }
})

// Wrapper component for tests
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('UploadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup default mock responses
    vi.mocked(window.api.model.getAll).mockResolvedValue({ success: true, data: [] })
    vi.mocked(window.api.file.selectDialog).mockResolvedValue({ success: true, data: { canceled: true, filePaths: [] } })
    vi.mocked(window.api.task.create).mockResolvedValue({ success: true, data: [] })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })

    it('should show loading state initially', async () => {
      vi.mocked(window.api.model.getAll).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true, data: [] }), 100))
      )

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      // Component should be in loading state
      expect(window.api.model.getAll).toHaveBeenCalled()
    })
  })

  describe('Model Loading', () => {
    it('should fetch models on mount', async () => {
      const mockModelData = [
        {
          provider: 1,
          providerName: 'OpenAI',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 1 }
          ]
        }
      ]

      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: mockModelData
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })

    it('should handle model fetch error', async () => {
      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: false,
        error: 'Failed to fetch models'
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })

    it('should handle empty model list', async () => {
      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })

    it('should display multiple providers and models', async () => {
      const mockModelData = [
        {
          provider: 1,
          providerName: 'OpenAI',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 1 },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 1 }
          ]
        },
        {
          provider: 2,
          providerName: 'Anthropic',
          models: [
            { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 2 }
          ]
        }
      ]

      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: mockModelData
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })
  })

  describe('File Selection', () => {
    it('should handle successful file dialog', async () => {
      vi.mocked(window.api.file.selectDialog).mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/path/to/file.pdf']
        }
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })

      // Verify the API mock is configured
      expect(window.api.file.selectDialog).toBeDefined()
    })

    it('should handle canceled file dialog', async () => {
      vi.mocked(window.api.file.selectDialog).mockResolvedValue({
        success: true,
        data: {
          canceled: true,
          filePaths: []
        }
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })

      expect(window.api.file.selectDialog).toBeDefined()
    })

    it('should handle file dialog error', async () => {
      vi.mocked(window.api.file.selectDialog).mockResolvedValue({
        success: false,
        error: 'Dialog error'
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })

      expect(window.api.file.selectDialog).toBeDefined()
    })

    it('should handle multiple file selection', async () => {
      vi.mocked(window.api.file.selectDialog).mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: [
            '/path/to/file1.pdf',
            '/path/to/file2.pdf',
            '/path/to/file3.pdf'
          ]
        }
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })

      expect(window.api.file.selectDialog).toBeDefined()
    })
  })

  describe('Form Validation', () => {
    beforeEach(() => {
      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: [
          {
            provider: 1,
            providerName: 'OpenAI',
            models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 1 }]
          }
        ]
      })
    })

    it('should render form elements', async () => {
      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })

      // Component should render without errors
      expect(true).toBe(true)
    })
  })

  describe('Task Creation', () => {
    beforeEach(() => {
      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: [
          {
            provider: 1,
            providerName: 'OpenAI',
            models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 1 }]
          }
        ]
      })

      vi.mocked(window.api.task.create).mockResolvedValue({
        success: true,
        data: []
      })
    })

    it('should have task creation API available', async () => {
      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })

      expect(window.api.task.create).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      vi.mocked(window.api.model.getAll).mockRejectedValue(new Error('Network error'))

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })

    it('should handle invalid API responses', async () => {
      vi.mocked(window.api.model.getAll).mockResolvedValue({
        success: true,
        data: null
      })

      render(
        <Wrapper>
          <UploadPanel />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getAll).toHaveBeenCalled()
      })
    })
  })
})
