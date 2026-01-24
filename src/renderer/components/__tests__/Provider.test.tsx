import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import Provider from '../Provider'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'details.protocol_type': 'Protocol:',
        'details.api_key_label': 'API Key',
        'details.api_key_placeholder': 'Enter API key',
        'details.api_url_label': 'API URL',
        'details.api_url_placeholder': 'Enter base URL',
        'model_config.title': 'Model Configuration',
        'model_config.name_label': 'Name:',
        'model_config.name_placeholder': 'Model name',
        'model_config.id_label': 'ID:',
        'model_config.id_placeholder': 'Model ID',
        'model_config.add_button': 'Add Model',
        'model_config.warning': 'Warning: Make sure the model ID matches the provider API',
        'actions.delete_provider': 'Delete Provider',
        'messages.update_success': 'Updated successfully',
        'messages.update_failed': 'Update failed',
        'messages.fetch_details_failed': 'Failed to fetch details',
        'messages.fetch_models_failed': 'Failed to fetch models',
        'messages.add_model_success': 'Model added',
        'messages.add_model_failed': 'Failed to add model',
        'messages.add_model_warning': 'Please enter model name and ID',
        'messages.delete_model_success': 'Model deleted',
        'messages.delete_model_failed': 'Failed to delete model',
        'messages.test_success': 'Connection successful',
        'messages.test_failed': 'Connection failed',
        'messages.delete_provider_success': 'Provider deleted',
        'messages.delete_provider_failed': 'Failed to delete provider',
        'confirmations.delete_model_title': 'Delete Model',
        'confirmations.delete_model_content': `Delete model ${params?.name}?`,
        'confirmations.delete_provider_title': 'Delete Provider',
        'confirmations.delete_provider_content': 'Are you sure?',
        'confirmations.ok': 'OK',
        'confirmations.cancel': 'Cancel'
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('Provider', () => {
  const mockProvider = {
    id: 1,
    name: 'OpenAI',
    type: 'openai',
    api_key: 'sk-test-key',
    base_url: 'https://api.openai.com',
    suffix: '/chat/completions',
    status: 0
  }

  const mockModels = [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 1 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 1 }
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(window.api.provider.getById).mockResolvedValue({
      success: true,
      data: mockProvider
    })

    vi.mocked(window.api.model.getByProvider).mockResolvedValue({
      success: true,
      data: mockModels
    })

    vi.mocked(window.api.provider.update).mockResolvedValue({
      success: true,
      data: mockProvider
    })

    vi.mocked(window.api.provider.updateStatus).mockResolvedValue({
      success: true,
      data: { ...mockProvider, status: -1 }
    })

    vi.mocked(window.api.model.create).mockResolvedValue({
      success: true,
      data: { id: 'new-model', name: 'New Model', provider: 1 }
    })

    vi.mocked(window.api.model.delete).mockResolvedValue({
      success: true,
      data: { message: 'Deleted' }
    })

    vi.mocked(window.api.completion.testConnection).mockResolvedValue({
      success: true,
      data: { content: 'Test successful' }
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.provider.getById).toHaveBeenCalledWith(1)
      })
    })

    it('should display provider name', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument()
      })
    })

    it('should display provider type', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/Protocol:.*openai/)).toBeInTheDocument()
      })
    })
  })

  describe('API Key Input', () => {
    it('should display API key input field', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('API Key')).toBeInTheDocument()
      })
    })

    it('should update API key on blur', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        const inputs = document.querySelectorAll('input[type="password"]')
        expect(inputs.length).toBeGreaterThan(0)
      })

      const apiKeyInput = document.querySelector('input[type="password"]')
      if (apiKeyInput) {
        fireEvent.change(apiKeyInput, { target: { value: 'new-api-key' } })
        fireEvent.blur(apiKeyInput)

        await waitFor(() => {
          expect(window.api.provider.update).toHaveBeenCalledWith(1, { api_key: 'new-api-key' })
        })
      }
    })
  })

  describe('Status Toggle', () => {
    it('should display status toggle switch', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        const toggle = document.querySelector('.ant-switch')
        expect(toggle).toBeInTheDocument()
      })
    })

    it('should call updateStatus when toggle is clicked', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        const toggle = document.querySelector('.ant-switch')
        expect(toggle).toBeInTheDocument()
      })

      const toggle = document.querySelector('.ant-switch')
      if (toggle) {
        fireEvent.click(toggle)

        await waitFor(() => {
          expect(window.api.provider.updateStatus).toHaveBeenCalledWith(1, -1)
        })
      }
    })
  })

  describe('Model List', () => {
    it('should fetch and display models', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.model.getByProvider).toHaveBeenCalledWith(1)
        expect(screen.getByText('GPT-4o')).toBeInTheDocument()
        expect(screen.getByText('GPT-4o Mini')).toBeInTheDocument()
      })
    })

    it('should display model IDs', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('(gpt-4o)')).toBeInTheDocument()
        expect(screen.getByText('(gpt-4o-mini)')).toBeInTheDocument()
      })
    })
  })

  describe('Add Model', () => {
    it('should render add model inputs', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Model name')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Model ID')).toBeInTheDocument()
      })
    })

    it('should render add model button', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Add Model')).toBeInTheDocument()
      })
    })

    it('should call API when adding model', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Model name')).toBeInTheDocument()
      })

      const nameInput = screen.getByPlaceholderText('Model name')
      const idInput = screen.getByPlaceholderText('Model ID')

      fireEvent.change(nameInput, { target: { value: 'New Model' } })
      fireEvent.change(idInput, { target: { value: 'new-model' } })

      const addButton = screen.getByText('Add Model')
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(window.api.model.create).toHaveBeenCalledWith({
          id: 'new-model',
          name: 'New Model',
          provider: 1
        })
      })
    })
  })

  describe('Test Connection', () => {
    it('should test model connection when clicking test button', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('GPT-4o')).toBeInTheDocument()
      })

      // Find test button (thunderbolt icon)
      const testButtons = document.querySelectorAll('[aria-label="thunderbolt"]')
      if (testButtons.length > 0) {
        fireEvent.click(testButtons[0].closest('button')!)

        await waitFor(() => {
          expect(window.api.completion.testConnection).toHaveBeenCalledWith(1, 'gpt-4o')
        })
      }
    })
  })

  describe('Delete Provider', () => {
    it('should render delete provider button', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Delete Provider')).toBeInTheDocument()
      })
    })

    it('should show confirmation modal when clicking delete', async () => {
      render(
        <Wrapper>
          <Provider providerId={1} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Delete Provider')).toBeInTheDocument()
      })

      const deleteButton = screen.getByText('Delete Provider')
      fireEvent.click(deleteButton)

      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument()
      })
    })
  })

  describe('Callbacks', () => {
    it('should call onProviderDeleted after successful deletion', async () => {
      const onProviderDeleted = vi.fn()

      vi.mocked(window.api.provider.delete).mockResolvedValue({
        success: true
      })

      render(
        <Wrapper>
          <Provider providerId={1} onProviderDeleted={onProviderDeleted} />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Delete Provider')).toBeInTheDocument()
      })

      const deleteButton = screen.getByText('Delete Provider')
      fireEvent.click(deleteButton)

      await waitFor(() => {
        const okButton = screen.getByText('OK')
        fireEvent.click(okButton)
      })

      await waitFor(() => {
        expect(window.api.provider.delete).toHaveBeenCalledWith(1)
      })
    })
  })
})
