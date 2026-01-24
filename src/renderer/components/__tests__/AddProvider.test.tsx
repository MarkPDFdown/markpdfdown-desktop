import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import AddProvider from '../AddProvider'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'add_provider.tab_label': 'Add Provider',
        'add_provider.name_label': 'Name',
        'add_provider.name_placeholder': 'Enter provider name',
        'add_provider.name_required': 'Name is required',
        'add_provider.type_label': 'Type',
        'add_provider.type_placeholder': 'Select provider type',
        'add_provider.type_required': 'Type is required',
        'add_provider.submit_button': 'Add Provider',
        'add_provider.success': 'Provider added successfully',
        'add_provider.failed': 'Failed to add provider'
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

describe('AddProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.provider.create).mockResolvedValue({
      success: true,
      data: { id: 1, name: 'Test Provider', type: 'openai' }
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Type')).toBeInTheDocument()
    })

    it('should render name input field', () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      expect(screen.getByPlaceholderText('Enter provider name')).toBeInTheDocument()
    })

    it('should render type select field', () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      expect(screen.getByText('Select provider type')).toBeInTheDocument()
    })

    it('should render submit button', () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      expect(screen.getByRole('button', { name: 'Add Provider' })).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should show error when name is empty on submit', async () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      const submitButton = screen.getByRole('button', { name: 'Add Provider' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument()
      })
    })

    it('should show error when type is not selected on submit', async () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      // Fill name only
      const nameInput = screen.getByPlaceholderText('Enter provider name')
      fireEvent.change(nameInput, { target: { value: 'Test Provider' } })

      const submitButton = screen.getByRole('button', { name: 'Add Provider' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Type is required')).toBeInTheDocument()
      })
    })
  })

  describe('Form Submission', () => {
    it('should call API on successful form submission', async () => {
      const onProviderAdded = vi.fn()

      render(
        <Wrapper>
          <AddProvider onProviderAdded={onProviderAdded} />
        </Wrapper>
      )

      // Fill form
      const nameInput = screen.getByPlaceholderText('Enter provider name')
      fireEvent.change(nameInput, { target: { value: 'My Provider' } })

      // Click select to open dropdown
      const selectElement = screen.getByText('Select provider type')
      fireEvent.mouseDown(selectElement)

      // Wait for dropdown to open and select OpenAI
      await waitFor(() => {
        const openaiOption = screen.getByText('OpenAI (Chat Completions)')
        fireEvent.click(openaiOption)
      })

      const submitButton = screen.getByRole('button', { name: 'Add Provider' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(window.api.provider.create).toHaveBeenCalledWith({
          name: 'My Provider',
          type: 'openai'
        })
      })
    })

    it('should call onProviderAdded callback when provider is created', async () => {
      const onProviderAdded = vi.fn()

      render(
        <Wrapper>
          <AddProvider onProviderAdded={onProviderAdded} />
        </Wrapper>
      )

      // Fill form
      const nameInput = screen.getByPlaceholderText('Enter provider name')
      fireEvent.change(nameInput, { target: { value: 'My Provider' } })

      const selectElement = screen.getByText('Select provider type')
      fireEvent.mouseDown(selectElement)

      await waitFor(() => {
        const openaiOption = screen.getByText('OpenAI (Chat Completions)')
        fireEvent.click(openaiOption)
      })

      const submitButton = screen.getByRole('button', { name: 'Add Provider' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(onProviderAdded).toHaveBeenCalledWith('1')
      })
    })

    it('should reset form after successful submission', async () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      // Fill form
      const nameInput = screen.getByPlaceholderText('Enter provider name')
      fireEvent.change(nameInput, { target: { value: 'My Provider' } })

      const selectElement = screen.getByText('Select provider type')
      fireEvent.mouseDown(selectElement)

      await waitFor(() => {
        const openaiOption = screen.getByText('OpenAI (Chat Completions)')
        fireEvent.click(openaiOption)
      })

      const submitButton = screen.getByRole('button', { name: 'Add Provider' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        // Form should be reset
        expect(nameInput).toHaveValue('')
      })
    })
  })

  describe('Error Handling', () => {
    it('should display error message on API failure', async () => {
      vi.mocked(window.api.provider.create).mockResolvedValue({
        success: false,
        error: 'Provider already exists'
      })

      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      // Fill form
      const nameInput = screen.getByPlaceholderText('Enter provider name')
      fireEvent.change(nameInput, { target: { value: 'Existing Provider' } })

      const selectElement = screen.getByText('Select provider type')
      fireEvent.mouseDown(selectElement)

      await waitFor(() => {
        const openaiOption = screen.getByText('OpenAI (Chat Completions)')
        fireEvent.click(openaiOption)
      })

      const submitButton = screen.getByRole('button', { name: 'Add Provider' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(window.api.provider.create).toHaveBeenCalled()
      })
    })
  })

  describe('Provider Type Options', () => {
    it('should have all provider type options', async () => {
      render(
        <Wrapper>
          <AddProvider />
        </Wrapper>
      )

      const selectElement = screen.getByText('Select provider type')
      fireEvent.mouseDown(selectElement)

      await waitFor(() => {
        expect(screen.getByText('OpenAI (Chat Completions)')).toBeInTheDocument()
        expect(screen.getByText('OpenAI (Responses API)')).toBeInTheDocument()
        expect(screen.getByText('Anthropic')).toBeInTheDocument()
        expect(screen.getByText('Gemini')).toBeInTheDocument()
        expect(screen.getByText('Ollama')).toBeInTheDocument()
      })
    })
  })
})
