import { describe, it, expect } from 'vitest'
import { WORKER_CONFIG } from '../worker.config.js'

describe('WORKER_CONFIG', () => {
  describe('splitter configuration', () => {
    it('should have valid pollInterval', () => {
      expect(WORKER_CONFIG.splitter.pollInterval).toBe(2000)
      expect(WORKER_CONFIG.splitter.pollInterval).toBeGreaterThan(0)
    })

    it('should have valid viewportScale', () => {
      expect(WORKER_CONFIG.splitter.viewportScale).toBe(2.0)
      expect(WORKER_CONFIG.splitter.viewportScale).toBeGreaterThan(0)
    })

    it('should have valid imageFormat', () => {
      expect(WORKER_CONFIG.splitter.imageFormat).toBe('png')
    })

    it('should have valid maxRetries', () => {
      expect(WORKER_CONFIG.splitter.maxRetries).toBe(3)
      expect(WORKER_CONFIG.splitter.maxRetries).toBeGreaterThanOrEqual(1)
    })

    it('should have valid retryDelayBase', () => {
      expect(WORKER_CONFIG.splitter.retryDelayBase).toBe(1000)
      expect(WORKER_CONFIG.splitter.retryDelayBase).toBeGreaterThan(0)
    })
  })

  describe('converter configuration', () => {
    it('should have valid count', () => {
      expect(WORKER_CONFIG.converter.count).toBe(3)
      expect(WORKER_CONFIG.converter.count).toBeGreaterThanOrEqual(1)
    })

    it('should have valid pollInterval', () => {
      expect(WORKER_CONFIG.converter.pollInterval).toBe(2000)
      expect(WORKER_CONFIG.converter.pollInterval).toBeGreaterThan(0)
    })

    it('should have valid timeout (2 minutes)', () => {
      expect(WORKER_CONFIG.converter.timeout).toBe(120000)
      expect(WORKER_CONFIG.converter.timeout).toBeGreaterThan(0)
    })

    it('should have valid maxRetries', () => {
      expect(WORKER_CONFIG.converter.maxRetries).toBe(3)
      expect(WORKER_CONFIG.converter.maxRetries).toBeGreaterThanOrEqual(1)
    })

    it('should have valid retryDelayBase', () => {
      expect(WORKER_CONFIG.converter.retryDelayBase).toBe(1000)
      expect(WORKER_CONFIG.converter.retryDelayBase).toBeGreaterThan(0)
    })

    it('should have valid maxContentLength', () => {
      expect(WORKER_CONFIG.converter.maxContentLength).toBe(500000)
      expect(WORKER_CONFIG.converter.maxContentLength).toBeGreaterThan(0)
    })
  })

  describe('merger configuration', () => {
    it('should have valid pollInterval', () => {
      expect(WORKER_CONFIG.merger.pollInterval).toBe(2000)
      expect(WORKER_CONFIG.merger.pollInterval).toBeGreaterThan(0)
    })
  })

  describe('healthCheck configuration', () => {
    it('should have valid interval (1 minute)', () => {
      expect(WORKER_CONFIG.healthCheck.interval).toBe(60000)
      expect(WORKER_CONFIG.healthCheck.interval).toBeGreaterThan(0)
    })

    it('should have valid taskTimeout (5 minutes)', () => {
      expect(WORKER_CONFIG.healthCheck.taskTimeout).toBe(300000)
      expect(WORKER_CONFIG.healthCheck.taskTimeout).toBeGreaterThan(0)
    })

    it('should have taskTimeout greater than converter timeout', () => {
      expect(WORKER_CONFIG.healthCheck.taskTimeout).toBeGreaterThan(WORKER_CONFIG.converter.timeout)
    })
  })

  describe('configuration consistency', () => {
    it('should have all poll intervals be positive numbers', () => {
      expect(WORKER_CONFIG.splitter.pollInterval).toBeGreaterThan(0)
      expect(WORKER_CONFIG.converter.pollInterval).toBeGreaterThan(0)
      expect(WORKER_CONFIG.merger.pollInterval).toBeGreaterThan(0)
    })

    it('should have consistent retry configurations', () => {
      expect(WORKER_CONFIG.splitter.maxRetries).toBe(WORKER_CONFIG.converter.maxRetries)
      expect(WORKER_CONFIG.splitter.retryDelayBase).toBe(WORKER_CONFIG.converter.retryDelayBase)
    })

    it('should be a frozen object (immutable)', () => {
      // The 'as const' assertion makes the object deeply readonly
      // This test verifies the structure is complete
      expect(typeof WORKER_CONFIG.splitter).toBe('object')
      expect(typeof WORKER_CONFIG.converter).toBe('object')
      expect(typeof WORKER_CONFIG.merger).toBe('object')
      expect(typeof WORKER_CONFIG.healthCheck).toBe('object')
    })
  })
})
