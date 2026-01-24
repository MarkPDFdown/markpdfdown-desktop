import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import Home from '../Home'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'title': 'MarkPDFdown',
        'subtitle': 'Convert PDF and images to Markdown with AI'
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock child components
vi.mock('../../components/UploadPanel', () => ({
  default: () => <div data-testid="upload-panel">Upload Panel Mock</div>
}))

vi.mock('../../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher">Language Switcher Mock</div>
}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      expect(screen.getByText('MarkPDFdown')).toBeInTheDocument()
    })

    it('should display logo image', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      const logo = screen.getByAltText('MarkPDFdown')
      expect(logo).toBeInTheDocument()
      expect(logo).toHaveAttribute('width', '100')
      expect(logo).toHaveAttribute('height', '100')
    })

    it('should display title', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      const title = screen.getByRole('heading', { level: 2 })
      expect(title).toHaveTextContent('MarkPDFdown')
    })

    it('should display subtitle', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      expect(screen.getByText('Convert PDF and images to Markdown with AI')).toBeInTheDocument()
    })
  })

  describe('Child Components', () => {
    it('should render UploadPanel component', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      expect(screen.getByTestId('upload-panel')).toBeInTheDocument()
    })

    it('should render LanguageSwitcher component', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      expect(screen.getByTestId('language-switcher')).toBeInTheDocument()
    })
  })

  describe('Layout', () => {
    it('should position LanguageSwitcher in top right', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      const languageSwitcher = screen.getByTestId('language-switcher')
      const container = languageSwitcher.parentElement

      expect(container).toHaveStyle({
        position: 'absolute',
        top: '16px',
        right: '16px'
      })
    })

    it('should center main content vertically and horizontally', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      const flexContainer = document.querySelector('.ant-flex')
      expect(flexContainer).toBeInTheDocument()
    })
  })

  describe('Logo Styling', () => {
    it('should have rounded corners', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      const logo = screen.getByAltText('MarkPDFdown')
      expect(logo).toHaveStyle({ borderRadius: '20%' })
    })

    it('should not be draggable', () => {
      render(
        <Wrapper>
          <Home />
        </Wrapper>
      )

      const logo = screen.getByAltText('MarkPDFdown')
      expect(logo).toHaveAttribute('draggable', 'false')
    })
  })
})
