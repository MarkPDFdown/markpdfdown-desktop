import { describe, it, expect } from 'vitest'
import {
  NO_SUFFIX,
  getDefaultSuffix,
  getSuffixSelection,
  resolveSuffix
} from '../providerSuffix.js'

const TYPES_WITH_DEFAULT = [
  ['openai', '/chat/completions'],
  ['openai-responses', '/responses'],
  ['gemini', '/models'],
  ['anthropic', '/messages'],
  ['ollama', '/chat']
] as const

describe('providerSuffix', () => {
  describe.each(TYPES_WITH_DEFAULT)('%s', (type, defaultSuffix) => {
    it('falls back to the default for an unset suffix', () => {
      for (const unset of ['', null, undefined]) {
        expect(getSuffixSelection(type, unset)).toBe(defaultSuffix)
        expect(resolveSuffix(type, unset)).toBe(defaultSuffix)
      }
    })

    it('appends nothing for the no-suffix marker but keeps it selected', () => {
      expect(getSuffixSelection(type, NO_SUFFIX)).toBe(NO_SUFFIX)
      expect(resolveSuffix(type, NO_SUFFIX)).toBe('')
    })

    it('keeps an explicit suffix', () => {
      expect(getSuffixSelection(type, '/custom')).toBe('/custom')
      expect(resolveSuffix(type, '/custom')).toBe('/custom')
    })
  })

  it('never treats the marker as a path', () => {
    expect(NO_SUFFIX).not.toBe('')
    expect(NO_SUFFIX.startsWith('/')).toBe(false)
  })

  it('selects no suffix for a type without a default, whatever the unset value', () => {
    expect(getDefaultSuffix('unknown')).toBe('')
    expect(getDefaultSuffix(null)).toBe('')
    expect(getSuffixSelection('unknown', '')).toBe(NO_SUFFIX)
    expect(resolveSuffix('unknown', '')).toBe('')
  })

  it('is stable when the selection is resolved again', () => {
    for (const [type] of TYPES_WITH_DEFAULT) {
      for (const stored of ['', NO_SUFFIX, '/custom']) {
        const selection = getSuffixSelection(type, stored)
        expect(getSuffixSelection(type, selection)).toBe(selection)
        expect(resolveSuffix(type, selection)).toBe(resolveSuffix(type, stored))
      }
    }
  })
})
