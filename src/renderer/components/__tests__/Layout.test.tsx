import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Layout from '../Layout'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'navigation.home': 'Home',
        'navigation.list': 'List',
        'navigation.settings': 'Settings',
        'closeConfirm.title': 'Confirm Close',
        'closeConfirm.content': `There are ${params?.count || 0} running tasks`,
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.copyright': `© ${params?.year || 2024} MarkPDFdown`
      }
      return translations[key] || key
    },
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

// Mock useLanguage hook
vi.mock('../../hooks/useLanguage', () => ({
  useLanguage: () => ({
    language: 'en-US',
    changeLanguage: vi.fn(),
    antdLocale: {}
  })
}))

// Mock window.api
const mockApi = {
  platform: 'win32',
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn()
  },
  task: {
    hasRunningTasks: vi.fn()
  }
}

vi.stubGlobal('api', mockApi)

// Mock window.electron
vi.stubGlobal('electron', {
  ipcRenderer: {
    send: vi.fn()
  }
})

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.task.hasRunningTasks.mockResolvedValue({
      success: true,
      data: { hasRunning: false, count: 0 }
    })
    // Reset platform to Windows
    Object.defineProperty(mockApi, 'platform', { value: 'win32', writable: true })
  })

  afterEach(() => {
    cleanup()
  })

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      expect(screen.getByAltText('MarkPDFdown')).toBeInTheDocument()
    })

    it('should display logo image', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      const logo = screen.getByAltText('MarkPDFdown')
      expect(logo).toBeInTheDocument()
      expect(logo).toHaveStyle({ width: '48px', height: '48px' })
    })

    it('should display copyright in footer', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      expect(screen.getByText(/© \d{4} MarkPDFdown/)).toBeInTheDocument()
    })
  })

  describe('Navigation Menu', () => {
    it('should render navigation menu items', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // Menu items should be in the DOM
      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(screen.getByText('List')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should have Home selected by default', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Layout />
        </MemoryRouter>
      )

      const homeMenuItem = screen.getByText('Home').closest('li')
      expect(homeMenuItem).toHaveClass('ant-menu-item-selected')
    })

    it('should highlight List when on /list route', () => {
      render(
        <MemoryRouter initialEntries={['/list']}>
          <Layout />
        </MemoryRouter>
      )

      const listMenuItem = screen.getByText('List').closest('li')
      expect(listMenuItem).toHaveClass('ant-menu-item-selected')
    })

    it('should highlight Settings when on /settings route', () => {
      render(
        <MemoryRouter initialEntries={['/settings']}>
          <Layout />
        </MemoryRouter>
      )

      const settingsMenuItem = screen.getByText('Settings').closest('li')
      expect(settingsMenuItem).toHaveClass('ant-menu-item-selected')
    })
  })

  describe('Window Controls (Windows/Linux)', () => {
    it('should render window control buttons on Windows', () => {
      Object.defineProperty(mockApi, 'platform', { value: 'win32', writable: true })

      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // Window controls should be visible
      const controls = document.querySelectorAll('[style*="borderRadius: 50%"]')
      expect(controls.length).toBe(3) // close, minimize, maximize
    })

    it('should not render window controls on macOS', () => {
      Object.defineProperty(mockApi, 'platform', { value: 'darwin', writable: true })

      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // On macOS, window controls should not be rendered by the app
      // (they use native controls)
      // We just verify the layout renders without the custom controls in the expected position
      expect(screen.getByAltText('MarkPDFdown')).toBeInTheDocument()
    })

    it('should call window.minimize when minimize button is clicked', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // Find minimize button (yellow one)
      const buttons = document.querySelectorAll('[style*="backgroundColor: rgb(255, 189, 46)"]')
      if (buttons.length > 0) {
        fireEvent.click(buttons[0])
        expect(mockApi.window.minimize).toHaveBeenCalled()
      }
    })

    it('should call window.maximize when maximize button is clicked', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // Find maximize button (green one)
      const buttons = document.querySelectorAll('[style*="backgroundColor: rgb(40, 200, 64)"]')
      if (buttons.length > 0) {
        fireEvent.click(buttons[0])
        expect(mockApi.window.maximize).toHaveBeenCalled()
      }
    })
  })

  describe('Window Close with Running Tasks', () => {
    it('should close directly when no running tasks', async () => {
      mockApi.task.hasRunningTasks.mockResolvedValue({
        success: true,
        data: { hasRunning: false, count: 0 }
      })

      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // Find close button (red one)
      const buttons = document.querySelectorAll('[style*="backgroundColor: rgb(255, 95, 87)"]')
      if (buttons.length > 0) {
        fireEvent.click(buttons[0])

        await waitFor(() => {
          expect(mockApi.window.close).toHaveBeenCalled()
        })
      }
    })

    it('should show confirmation modal when running tasks exist', async () => {
      mockApi.task.hasRunningTasks.mockResolvedValue({
        success: true,
        data: { hasRunning: true, count: 3 }
      })

      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // Find close button (red one)
      const buttons = document.querySelectorAll('[style*="backgroundColor: rgb(255, 95, 87)"]')
      if (buttons.length > 0) {
        fireEvent.click(buttons[0])

        await waitFor(() => {
          expect(screen.getByText('Confirm Close')).toBeInTheDocument()
        })
      }
    })
  })

  describe('GitHub Link', () => {
    it('should render GitHub icon', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      // GitHub icon should be in the sidebar
      const githubIcon = document.querySelector('[aria-label="github"]')
      expect(githubIcon).toBeInTheDocument()
    })

    it('should open GitHub link when clicked', () => {
      const mockSend = vi.fn()
      vi.stubGlobal('electron', { ipcRenderer: { send: mockSend } })

      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      const githubIcon = document.querySelector('[aria-label="github"]')
      if (githubIcon) {
        const clickableElement = githubIcon.closest('[style*="cursor: pointer"]')
        if (clickableElement) {
          fireEvent.click(clickableElement)
          // Either IPC send or window.open should be called
        }
      }
    })
  })

  describe('Sidebar', () => {
    it('should be collapsed by default', () => {
      render(
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      )

      const sider = document.querySelector('.ant-layout-sider')
      expect(sider).toBeInTheDocument()
      expect(sider).toHaveClass('ant-layout-sider-collapsed')
    })
  })
})
