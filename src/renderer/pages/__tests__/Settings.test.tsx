import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import Settings from '../Settings'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'tabs.model_service': 'Model Service',
        'tabs.about': 'About'
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock child components
vi.mock('../../components/ModelService', () => ({
  default: () => <div data-testid="model-service">Model Service Mock</div>
}))

vi.mock('../../components/About', () => ({
  default: () => <div data-testid="about">About Mock</div>
}))

vi.mock('../../components/AccountCenter', () => ({
  default: () => <div data-testid="account-center">Account Center Mock</div>
}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('Settings', () => {
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
          <Settings />
        </Wrapper>
      )

      expect(screen.getByText('Model Service')).toBeInTheDocument()
    })

    it('should render tabs component', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const tabs = document.querySelector('.ant-tabs')
      expect(tabs).toBeInTheDocument()
    })
  })

  describe('Tab Items', () => {
    it('should display Model Service tab', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      expect(screen.getByText('Model Service')).toBeInTheDocument()
    })

    it('should display About tab', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      expect(screen.getByText('About')).toBeInTheDocument()
    })

    it('should display Account tab', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    it('should have Account tab active by default', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const accountTab = screen.getByText('Account').closest('.ant-tabs-tab')
      expect(accountTab).toHaveClass('ant-tabs-tab-active')
    })
  })

  describe('Tab Content', () => {
    it('should render AccountCenter component by default', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      expect(screen.getByTestId('account-center')).toBeInTheDocument()
    })

    it('should render ModelService component when Model Service tab is clicked', async () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const modelServiceTab = screen.getByText('Model Service')
      fireEvent.click(modelServiceTab)

      await waitFor(() => {
        expect(screen.getByTestId('model-service')).toBeInTheDocument()
      })
    })

    it('should render About component when About tab is clicked', async () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const aboutTab = screen.getByText('About')
      fireEvent.click(aboutTab)

      await waitFor(() => {
        expect(screen.getByTestId('about')).toBeInTheDocument()
      })
    })
  })

  describe('Tab Icons', () => {
    it('should display user icon for Account tab', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const accountTab = screen.getByText('Account').closest('.ant-tabs-tab')
      const icon = accountTab?.querySelector('[aria-label="user"]')
      expect(icon).toBeInTheDocument()
    })

    it('should display API icon for Model Service tab', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const modelServiceTab = screen.getByText('Model Service').closest('.ant-tabs-tab')
      const icon = modelServiceTab?.querySelector('[aria-label="api"]')
      expect(icon).toBeInTheDocument()
    })

    it('should display mail icon for About tab', () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const aboutTab = screen.getByText('About').closest('.ant-tabs-tab')
      const icon = aboutTab?.querySelector('[aria-label="mail"]')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('Tab Switching', () => {
    it('should switch to Model Service tab when clicked', async () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const modelServiceTab = screen.getByText('Model Service')
      fireEvent.click(modelServiceTab)

      await waitFor(() => {
        const modelServiceTabElement = screen.getByText('Model Service').closest('.ant-tabs-tab')
        expect(modelServiceTabElement).toHaveClass('ant-tabs-tab-active')
      })
    })

    it('should switch to About tab when clicked', async () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      const aboutTab = screen.getByText('About')
      fireEvent.click(aboutTab)

      await waitFor(() => {
        const aboutTabElement = screen.getByText('About').closest('.ant-tabs-tab')
        expect(aboutTabElement).toHaveClass('ant-tabs-tab-active')
      })
    })

    it('should switch back to Account tab', async () => {
      render(
        <Wrapper>
          <Settings />
        </Wrapper>
      )

      // Click About tab first
      fireEvent.click(screen.getByText('About'))

      await waitFor(() => {
        expect(screen.getByText('About').closest('.ant-tabs-tab')).toHaveClass('ant-tabs-tab-active')
      })

      // Click Account tab
      fireEvent.click(screen.getByText('Account'))

      await waitFor(() => {
        const accountTab = screen.getByText('Account').closest('.ant-tabs-tab')
        expect(accountTab).toHaveClass('ant-tabs-tab-active')
      })
    })
  })
})
