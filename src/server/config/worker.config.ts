/**
 * Centralized worker configuration.
 *
 * All worker-related settings are defined here for easy adjustment
 * and consistency across the application.
 */
export const WORKER_CONFIG = {
  /**
   * Splitter worker configuration.
   * Handles PDF and image splitting into individual pages.
   */
  splitter: {
    /** Poll interval for checking new tasks (ms) */
    pollInterval: 2000,
    /** PDF to PNG viewport scale (~144 DPI at 2.0) */
    viewportScale: 2.0,
    /** Output image format */
    imageFormat: 'png' as const,
    /** Maximum retry attempts for transient errors */
    maxRetries: 3,
    /** Base retry delay in milliseconds (exponential backoff) */
    retryDelayBase: 1000,
  },

  /**
   * Converter worker configuration.
   * Handles image to markdown conversion via LLM.
   */
  converter: {
    /** Number of parallel converter workers */
    count: 3,
    /** Poll interval for checking new task details (ms) */
    pollInterval: 2000,
    /** Timeout for LLM conversion (ms) */
    timeout: 120000, // 2 minutes
  },

  /**
   * Merger worker configuration.
   * Handles merging markdown pages into final document.
   */
  merger: {
    /** Poll interval for checking tasks ready to merge (ms) */
    pollInterval: 2000,
  },

  /**
   * Health check configuration.
   * Monitors and recovers stuck workers/tasks.
   */
  healthCheck: {
    /** Health check interval (ms) */
    interval: 60000, // 1 minute
    /** Task timeout threshold (ms) */
    taskTimeout: 300000, // 5 minutes
  },
} as const;
