import { render, waitFor } from '@testing-library/react'
import React, { useContext } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../I18nContext'
import { I18nContext } from '../I18nContextDefinition'

const mockChangeLanguage = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      changeLanguage: mockChangeLanguage,
    },
  }),
}))

let latestContext: any

const Probe = () => {
  latestContext = useContext(I18nContext)
  return <div data-testid="lang">{latestContext.language}</div>
}

describe('I18nContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    latestContext = undefined
    localStorage.clear()
  })

  it('uses localStorage initial language and syncs i18n', async () => {
    localStorage.setItem('app_language', 'ja-JP')

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(latestContext.language).toBe('ja-JP')
    })
    expect(mockChangeLanguage).toHaveBeenCalledWith('ja-JP')
  })

  it('falls back to en-US and updates locale on changeLanguage', async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(latestContext.language).toBe('en-US')
      expect(latestContext.antdLocale).toBeTruthy()
    })

    latestContext.changeLanguage('zh-CN')

    await waitFor(() => {
      expect(latestContext.language).toBe('zh-CN')
      expect(latestContext.antdLocale.locale).toBe('zh-cn')
    })

    expect(localStorage.getItem('app_language')).toBe('zh-CN')
    expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN')
  })

  it('maps ar-SA to antd ar locale', async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(latestContext).toBeTruthy()
    })

    latestContext.changeLanguage('ar-SA')

    await waitFor(() => {
      expect(latestContext.language).toBe('ar-SA')
      expect(latestContext.antdLocale.locale).toBe('ar')
    })
  })
})
