import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import About from '../About'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'about.subtitle': 'Convert PDF to Markdown with AI',
        'about.buttons.website': 'Website',
        'about.buttons.license': 'License',
        'about.buttons.feedback': 'Feedback',
        'about.buttons.contact': 'Contact'
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock window.api.app.getVersion
vi.stubGlobal('api', {
  app: {
    getVersion: vi.fn().mockResolvedValue('1.0.0')
  }
})

// Mock window.open
const mockWindowOpen = vi.fn()
vi.stubGlobal('open', mockWindowOpen)

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('About', () => {
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
          <About />
        </Wrapper>
      )

      expect(screen.getByText('MarkPDFdown')).toBeInTheDocument()
    })

    it('should display the logo image', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      const logo = screen.getByAltText('MarkPDFdown')
      expect(logo).toBeInTheDocument()
      expect(logo).toHaveAttribute('width', '100')
      expect(logo).toHaveAttribute('height', '100')
    })

    it('should display version badge', async () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('v1.0.0')).toBeInTheDocument()
      })
    })

    it('should display subtitle', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      expect(screen.getByText('Convert PDF to Markdown with AI')).toBeInTheDocument()
    })
  })

  describe('External Link Buttons', () => {
    it('should render all action buttons', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      expect(screen.getByText('Website')).toBeInTheDocument()
      expect(screen.getByText('License')).toBeInTheDocument()
      expect(screen.getByText('Feedback')).toBeInTheDocument()
      expect(screen.getByText('Contact')).toBeInTheDocument()
    })

    it('should open website link when Website button is clicked', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      const websiteButton = screen.getByText('Website')
      fireEvent.click(websiteButton)

      expect(mockWindowOpen).toHaveBeenCalledWith('https://github.com/MarkPDFdown', '_blank')
    })

    it('should open license link when License button is clicked', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      const licenseButton = screen.getByText('License')
      fireEvent.click(licenseButton)

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://github.com/MarkPDFdown/desktop/blob/master/LICENSE',
        '_blank'
      )
    })

    it('should open feedback link when Feedback button is clicked', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      const feedbackButton = screen.getByText('Feedback')
      fireEvent.click(feedbackButton)

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://github.com/MarkPDFdown/desktop/issues',
        '_blank'
      )
    })

    it('should open contact mailto link when Contact button is clicked', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      const contactButton = screen.getByText('Contact')
      fireEvent.click(contactButton)

      expect(mockWindowOpen).toHaveBeenCalledWith('mailto:jorben@aix.me', '_blank')
    })
  })

  describe('Logo Image', () => {
    it('should not be draggable', () => {
      render(
        <Wrapper>
          <About />
        </Wrapper>
      )

      const logo = screen.getByAltText('MarkPDFdown')
      expect(logo).toHaveAttribute('draggable', 'false')
    })
  })
})
