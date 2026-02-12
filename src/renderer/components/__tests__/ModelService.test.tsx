import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import ModelService from '../ModelService'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'add_provider.tab_label': 'Add Provider',
        'add_provider.name_label': 'Name',
        'add_provider.name_placeholder': 'Enter provider name',
        'add_provider.type_label': 'Type',
        'add_provider.type_placeholder': 'Select provider type',
        'add_provider.submit_button': 'Add Provider'
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

describe('ModelService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock provider.getAll to return providers
    vi.mocked(window.api.provider.getAll).mockResolvedValue({
      success: true,
      data: [
        { id: 1, name: 'OpenAI', type: 'openai', api_key: '', base_url: '', suffix: '', status: 0 },
        { id: 2, name: 'Anthropic', type: 'anthropic', api_key: '', base_url: '', suffix: '', status: 0 }
      ]
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.provider.getAll).toHaveBeenCalled()
      })
    })

    it('should render tabs component', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        const tabs = document.querySelector('.ant-tabs')
        expect(tabs).toBeInTheDocument()
      })
    })

    it('should use left tab position', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        const tabs = document.querySelector('.ant-tabs-left')
        expect(tabs).toBeInTheDocument()
      })
    })
  })

  describe('Preset Integration', () => {
    it('should fetch both providers and presets on mount', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.provider.getAll).toHaveBeenCalled()
        expect(window.api.provider.getPresets).toHaveBeenCalled()
      })
    })

    it('should sort providers by preset order', async () => {
      vi.mocked(window.api.provider.getAll).mockResolvedValue({
        success: true,
        data: [
          { id: 3, name: 'CustomProvider', type: 'openai', api_key: '', base_url: '', suffix: '', status: 0 },
          { id: 2, name: 'Anthropic', type: 'anthropic', api_key: '', base_url: '', suffix: '', status: 0 },
          { id: 1, name: 'OpenAI', type: 'openai-responses', api_key: '', base_url: '', suffix: '', status: 0 },
        ]
      })
      vi.mocked(window.api.provider.getPresets).mockResolvedValue({
        success: true,
        data: [
          { name: 'OpenAI', type: 'openai-responses' },
          { name: 'Anthropic', type: 'anthropic' },
        ]
      })

      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        const tabs = document.querySelectorAll('.ant-tabs-tab')
        const tabTexts = Array.from(tabs).map(tab => tab.textContent?.trim())
        // Preset providers should come first (OpenAI, Anthropic), then custom, then Add Provider
        const openaiIndex = tabTexts.findIndex(t => t?.includes('OpenAI'))
        const anthropicIndex = tabTexts.findIndex(t => t?.includes('Anthropic'))
        const customIndex = tabTexts.findIndex(t => t?.includes('CustomProvider'))
        expect(openaiIndex).toBeLessThan(anthropicIndex)
        expect(anthropicIndex).toBeLessThan(customIndex)
      })
    })

    it('should handle getPresets failure gracefully', async () => {
      vi.mocked(window.api.provider.getPresets).mockResolvedValue({
        success: false,
        error: 'Failed to fetch presets'
      })

      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      // Should still render providers even if presets fail
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument()
        expect(screen.getByText('Anthropic')).toBeInTheDocument()
      })
    })
  })

  describe('Provider Tabs', () => {
    it('should fetch providers on mount', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        expect(window.api.provider.getAll).toHaveBeenCalled()
      })
    })

    it('should display provider tabs when providers exist', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument()
        expect(screen.getByText('Anthropic')).toBeInTheDocument()
      })
    })

    it('should select first provider by default when providers exist', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        const openaiTab = screen.getByText('OpenAI').closest('.ant-tabs-tab')
        expect(openaiTab).toHaveClass('ant-tabs-tab-active')
      })
    })

    it('should display Add Provider tab', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        // There may be multiple "Add Provider" elements (tab label and button)
        const addProviderElements = screen.getAllByText('Add Provider')
        expect(addProviderElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Empty State', () => {
    it('should show Add Provider tab when no providers exist', async () => {
      vi.mocked(window.api.provider.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        // Find the Add Provider tab specifically (not the button)
        const tabs = document.querySelectorAll('.ant-tabs-tab')
        const addProviderTab = Array.from(tabs).find(tab => tab.textContent?.includes('Add Provider'))
        expect(addProviderTab).toHaveClass('ant-tabs-tab-active')
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle API error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(window.api.provider.getAll).mockResolvedValue({
        success: false,
        error: 'Failed to fetch providers'
      })

      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Tab Icons', () => {
    it('should display cloud icon for provider tabs', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        const openaiTab = screen.getByText('OpenAI').closest('.ant-tabs-tab')
        const icon = openaiTab?.querySelector('[aria-label="cloud"]')
        expect(icon).toBeInTheDocument()
      })
    })

    it('should display plus icon for Add Provider tab', async () => {
      render(
        <Wrapper>
          <ModelService />
        </Wrapper>
      )

      await waitFor(() => {
        // Find the Add Provider tab specifically
        const tabs = document.querySelectorAll('.ant-tabs-tab')
        const addTab = Array.from(tabs).find(tab => tab.textContent?.includes('Add Provider'))
        const icon = addTab?.querySelector('[aria-label="plus-square"]')
        expect(icon).toBeInTheDocument()
      })
    })
  })
})
