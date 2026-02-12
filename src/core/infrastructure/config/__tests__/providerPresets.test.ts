import { describe, it, expect } from 'vitest'
import {
  providerPresets,
  findProviderPreset,
  getProviderPresetKey,
} from '../providerPresets.js'

describe('providerPresets', () => {
  describe('providerPresets array', () => {
    it('should contain all expected preset providers', () => {
      const names = providerPresets.map((p) => p.name)
      expect(names).toContain('OpenAI')
      expect(names).toContain('Anthropic')
      expect(names).toContain('Gemini')
      expect(names).toContain('ZenMux')
      expect(names).toContain('OpenRouter')
      expect(names).toContain('SiliconFlow')
      expect(names).toContain('Ollama')
    })

    it('should have required fields for each preset', () => {
      for (const preset of providerPresets) {
        expect(preset.name).toBeTruthy()
        expect(preset.type).toBeTruthy()
        expect(preset.apiBase).toBeTruthy()
        expect(preset.modelListApi).toBeTruthy()
        expect(preset.modelNameField).toBeTruthy()
        expect(preset.modelIdField).toBeTruthy()
      }
    })

    it('should have unique type+name combinations', () => {
      const keys = providerPresets.map((p) => `${p.type}:${p.name}`)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    it('should have capabilityField and capabilityFilter configured for vision-filtering providers', () => {
      const anthropic = providerPresets.find((p) => p.name === 'Anthropic')
      expect(anthropic?.capabilityField).toBe('input_modalities')
      expect(anthropic?.capabilityFilter).toBe('image')

      const zenmux = providerPresets.find((p) => p.name === 'ZenMux')
      expect(zenmux?.capabilityField).toBe('input_modalities')
      expect(zenmux?.capabilityFilter).toBe('image')

      const openrouter = providerPresets.find((p) => p.name === 'OpenRouter')
      expect(openrouter?.capabilityField).toBe('architecture.input_modalities')
      expect(openrouter?.capabilityFilter).toBe('image')
    })

    it('should not have capabilityField for providers without vision filtering', () => {
      const openai = providerPresets.find((p) => p.name === 'OpenAI')
      expect(openai?.capabilityField).toBeUndefined()

      const siliconflow = providerPresets.find((p) => p.name === 'SiliconFlow')
      expect(siliconflow?.capabilityField).toBeUndefined()

      const ollama = providerPresets.find((p) => p.name === 'Ollama')
      expect(ollama?.capabilityField).toBeUndefined()
    })
  })

  describe('findProviderPreset', () => {
    it('should find a preset by type and name', () => {
      const result = findProviderPreset('openai-responses', 'OpenAI')
      expect(result).toBeDefined()
      expect(result?.name).toBe('OpenAI')
      expect(result?.type).toBe('openai-responses')
    })

    it('should return undefined for non-existent preset', () => {
      const result = findProviderPreset('openai', 'NonExistent')
      expect(result).toBeUndefined()
    })

    it('should return undefined when type matches but name does not', () => {
      const result = findProviderPreset('openai-responses', 'Anthropic')
      expect(result).toBeUndefined()
    })

    it('should return undefined when name matches but type does not', () => {
      const result = findProviderPreset('gemini', 'OpenAI')
      expect(result).toBeUndefined()
    })

    it('should distinguish providers with the same type but different names', () => {
      const anthropic = findProviderPreset('anthropic', 'Anthropic')
      const zenmux = findProviderPreset('anthropic', 'ZenMux')
      expect(anthropic).toBeDefined()
      expect(zenmux).toBeDefined()
      expect(anthropic?.apiBase).not.toBe(zenmux?.apiBase)
    })
  })

  describe('getProviderPresetKey', () => {
    it('should generate correct key format', () => {
      expect(getProviderPresetKey('openai', 'OpenAI')).toBe('openai:OpenAI')
    })

    it('should produce different keys for different type+name', () => {
      const key1 = getProviderPresetKey('anthropic', 'Anthropic')
      const key2 = getProviderPresetKey('anthropic', 'ZenMux')
      expect(key1).not.toBe(key2)
    })
  })
})
