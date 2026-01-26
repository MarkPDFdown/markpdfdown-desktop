import { BrowserWindow } from 'electron';

interface PooledWindow {
  window: BrowserWindow;
  busy: boolean;
}

interface WaitingRequest {
  resolve: (window: BrowserWindow) => void;
  reject: (error: Error) => void;
  width: number;
  height: number;
  timer: NodeJS.Timeout;
}

/**
 * Configuration options for the render window pool.
 */
export interface RenderWindowPoolConfig {
  /** Maximum number of windows in the pool */
  maxSize: number;
  /** Timeout in milliseconds when waiting for an available window */
  acquireTimeout: number;
}

const DEFAULT_CONFIG: RenderWindowPoolConfig = {
  maxSize: 3,
  acquireTimeout: 60000, // 60 seconds
};

/**
 * BrowserWindow pool for rendering HTML content.
 *
 * Manages a pool of off-screen browser windows to avoid the overhead
 * of creating and destroying windows for each render operation.
 * Includes timeout mechanism to prevent deadlocks.
 *
 * Use RenderWindowPoolFactory.create() to instantiate.
 */
export class RenderWindowPool {
  private pool: PooledWindow[] = [];
  private readonly config: RenderWindowPoolConfig;
  private waitQueue: WaitingRequest[] = [];
  private destroyed = false;

  constructor(config: RenderWindowPoolConfig) {
    this.config = config;
  }

  /**
   * Acquire a render window from the pool.
   *
   * If no window is available and the pool is not at max capacity,
   * a new window is created. If at max capacity, waits for a window
   * to be released.
   *
   * @param width - Window width
   * @param height - Window height
   * @returns A BrowserWindow ready for rendering
   * @throws Error if timeout occurs or pool is destroyed
   */
  async acquire(width: number, height: number): Promise<BrowserWindow> {
    if (this.destroyed) {
      throw new Error('RenderWindowPool has been destroyed');
    }

    // Look for an available window
    const available = this.pool.find((p) => !p.busy);
    if (available) {
      available.busy = true;
      available.window.setSize(width, height);
      return available.window;
    }

    // Create new window if pool not at max capacity
    if (this.pool.length < this.config.maxSize) {
      const window = this.createWindow(width, height);
      this.pool.push({ window, busy: true });
      return window;
    }

    // Wait for a window to become available
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from wait queue
        const index = this.waitQueue.findIndex((r) => r.timer === timer);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(
          new Error(
            `RenderWindowPool acquire timeout after ${this.config.acquireTimeout}ms. ` +
              `All ${this.config.maxSize} windows are busy.`
          )
        );
      }, this.config.acquireTimeout);

      this.waitQueue.push({
        resolve,
        reject,
        width,
        height,
        timer,
      });
    });
  }

  /**
   * Release a window back to the pool.
   *
   * The window is cleaned up (navigated to about:blank) before
   * being made available again.
   *
   * @param window - Window to release
   */
  async release(window: BrowserWindow): Promise<void> {
    const pooled = this.pool.find((p) => p.window === window);
    if (!pooled) return;

    // Check if window is still valid
    if (window.isDestroyed()) {
      const index = this.pool.indexOf(pooled);
      if (index !== -1) {
        this.pool.splice(index, 1);
      }
      return;
    }

    // Clean up window state
    try {
      await window.loadURL('about:blank');
    } catch {
      // Ignore cleanup failures
    }

    // If there's a waiting request, fulfill it
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      clearTimeout(waiter.timer);
      window.setSize(waiter.width, waiter.height);
      waiter.resolve(window);
    } else {
      pooled.busy = false;
    }
  }

  /**
   * Destroy all windows in the pool.
   *
   * Rejects all waiting requests and destroys all windows.
   * The pool cannot be used after this method is called.
   */
  destroy(): void {
    this.destroyed = true;

    // Reject all waiting requests
    for (const waiter of this.waitQueue) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('RenderWindowPool is being destroyed'));
    }
    this.waitQueue = [];

    // Destroy all windows
    for (const pooled of this.pool) {
      if (!pooled.window.isDestroyed()) {
        pooled.window.destroy();
      }
    }
    this.pool = [];
  }

  /**
   * Get current pool status for debugging.
   */
  getStatus(): { total: number; busy: number; waiting: number } {
    return {
      total: this.pool.length,
      busy: this.pool.filter((p) => p.busy).length,
      waiting: this.waitQueue.length,
    };
  }

  private createWindow(width: number, height: number): BrowserWindow {
    return new BrowserWindow({
      show: false,
      width,
      height,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });
  }
}

/**
 * Factory for creating RenderWindowPool instances.
 *
 * Each pool is independent, allowing different configurations
 * for different use cases.
 */
export class RenderWindowPoolFactory {
  /**
   * Create a new render window pool.
   *
   * @param config - Optional configuration overrides
   * @returns New RenderWindowPool instance
   */
  static create(config: Partial<RenderWindowPoolConfig> = {}): RenderWindowPool {
    return new RenderWindowPool({
      ...DEFAULT_CONFIG,
      ...config,
    });
  }
}
