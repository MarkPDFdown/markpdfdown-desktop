import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import LanguageSwitcher from '../LanguageSwitcher'

// Mock useLanguage hook
const mockChangeLanguage = vi.fn()
let mockLanguage = 'en-US'

vi.mock('../../hooks/useLanguage', () => ({
  useLanguage: () => ({
    language: mockLanguage,
    changeLanguage: mockChangeLanguage
  })
}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLanguage = 'en-US'
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should display current language label for English', () => {
      mockLanguage = 'en-US'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByText('English')).toBeInTheDocument()
    })

    it('should display current language label for Chinese', () => {
      mockLanguage = 'zh-CN'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByText('简体中文')).toBeInTheDocument()
    })

    it('should display current language label for Japanese', () => {
      mockLanguage = 'ja-JP'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByText('日本語')).toBeInTheDocument()
    })

    it('should display current language label for Russian', () => {
      mockLanguage = 'ru-RU'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByText('Русский')).toBeInTheDocument()
    })

    it('should display current language label for Persian', () => {
      mockLanguage = 'fa-IR'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByText('فارسی')).toBeInTheDocument()
    })

    it('should display current language label for Arabic', () => {
      mockLanguage = 'ar-SA'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      expect(screen.getByText('العربية')).toBeInTheDocument()
    })
  })

  describe('Dropdown Interaction', () => {
    it('should open dropdown menu when clicked', async () => {
      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      const button = screen.getByRole('button')
      fireEvent.mouseEnter(button)
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('🇺🇸 English')).toBeInTheDocument()
      })
    })

    it('should show all language options in dropdown', async () => {
      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('🇺🇸 English')).toBeInTheDocument()
        expect(screen.getByText('🇨🇳 简体中文')).toBeInTheDocument()
        expect(screen.getByText('🇯🇵 日本語')).toBeInTheDocument()
        expect(screen.getByText('🇷🇺 Русский')).toBeInTheDocument()
        expect(screen.getByText('🇮🇷 فارسی')).toBeInTheDocument()
        expect(screen.getByText('🇸🇦 العربية')).toBeInTheDocument()
      })
    })
  })

  describe('Language Switching', () => {
    it('should call changeLanguage when selecting Chinese', async () => {
      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        const chineseOption = screen.getByText('🇨🇳 简体中文')
        fireEvent.click(chineseOption)
      })

      expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN')
    })

    it('should call changeLanguage when selecting Japanese', async () => {
      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        const japaneseOption = screen.getByText('🇯🇵 日本語')
        fireEvent.click(japaneseOption)
      })

      expect(mockChangeLanguage).toHaveBeenCalledWith('ja-JP')
    })

    it('should call changeLanguage when selecting English', async () => {
      mockLanguage = 'zh-CN'

      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        const englishOption = screen.getByText('🇺🇸 English')
        fireEvent.click(englishOption)
      })

      expect(mockChangeLanguage).toHaveBeenCalledWith('en-US')
    })
  })

  describe('Globe Icon', () => {
    it('should display globe icon', () => {
      render(
        <Wrapper>
          <LanguageSwitcher />
        </Wrapper>
      )

      // GlobalOutlined icon should be rendered
      const button = screen.getByRole('button')
      expect(button.querySelector('[aria-label="global"]') || button.querySelector('svg')).toBeTruthy()
    })
  })
})
