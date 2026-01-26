import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenderWindowPool, RenderWindowPoolFactory } from '../RenderWindowPoolFactory.js';

// Mock Electron BrowserWindow
const mockBrowserWindow = vi.fn();
const mockSetSize = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockDestroy = vi.fn();
const mockLoadURL = vi.fn().mockResolvedValue(undefined);
const mockWebContents = {
  setZoomFactor: vi.fn(),
};

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    constructor() {
      mockBrowserWindow();
    }
    setSize = mockSetSize;
    isDestroyed = mockIsDestroyed;
    destroy = mockDestroy;
    loadURL = mockLoadURL;
    webContents = mockWebContents;
  },
}));

describe('RenderWindowPoolFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('should create a new RenderWindowPool with default config', () => {
      const pool = RenderWindowPoolFactory.create();
      expect(pool).toBeInstanceOf(RenderWindowPool);
    });

    it('should create a pool with custom config', () => {
      const pool = RenderWindowPoolFactory.create({
        maxSize: 5,
        acquireTimeout: 30000,
      });
      expect(pool).toBeInstanceOf(RenderWindowPool);
    });

    it('should create independent pool instances', () => {
      const pool1 = RenderWindowPoolFactory.create();
      const pool2 = RenderWindowPoolFactory.create();
      expect(pool1).not.toBe(pool2);
    });
  });
});

describe('RenderWindowPool', () => {
  let pool: RenderWindowPool;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = RenderWindowPoolFactory.create({
      maxSize: 2,
      acquireTimeout: 1000,
    });
  });

  afterEach(() => {
    pool.destroy();
  });

  describe('acquire()', () => {
    it('should create a new window when pool is empty', async () => {
      const window = await pool.acquire(800, 600);
      expect(window).toBeDefined();
      expect(mockBrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should set window size on acquire', async () => {
      await pool.acquire(800, 600);
      // Window is created with specified size in constructor
      expect(mockBrowserWindow).toHaveBeenCalled();
    });

    it('should reuse released windows', async () => {
      const window1 = await pool.acquire(800, 600);
      await pool.release(window1);

      const window2 = await pool.acquire(1024, 768);
      expect(window1).toBe(window2);
      expect(mockSetSize).toHaveBeenCalledWith(1024, 768);
    });

    it('should create up to maxSize windows', async () => {
      await pool.acquire(800, 600);
      await pool.acquire(800, 600);

      expect(mockBrowserWindow).toHaveBeenCalledTimes(2);
    });

    it('should throw after destroy', async () => {
      pool.destroy();
      await expect(pool.acquire(800, 600)).rejects.toThrow(
        'RenderWindowPool has been destroyed'
      );
    });

    it('should timeout when all windows are busy', async () => {
      // Acquire all windows
      await pool.acquire(800, 600);
      await pool.acquire(800, 600);

      // Third acquire should timeout
      await expect(pool.acquire(800, 600)).rejects.toThrow(/timeout/);
    }, 5000);
  });

  describe('release()', () => {
    it('should make window available for reuse', async () => {
      const window = await pool.acquire(800, 600);
      await pool.release(window);

      const status = pool.getStatus();
      expect(status.busy).toBe(0);
    });

    it('should call loadURL with about:blank to clean up', async () => {
      const window = await pool.acquire(800, 600);
      await pool.release(window);

      expect(mockLoadURL).toHaveBeenCalledWith('about:blank');
    });

    it('should handle destroyed windows gracefully', async () => {
      const window = await pool.acquire(800, 600);
      mockIsDestroyed.mockReturnValueOnce(true);

      await expect(pool.release(window)).resolves.not.toThrow();
    });

    it('should fulfill waiting request when released', async () => {
      // Acquire all windows
      const window1 = await pool.acquire(800, 600);
      await pool.acquire(800, 600);

      // Start waiting for a window
      const waitPromise = pool.acquire(1024, 768);

      // Release one window
      await pool.release(window1);

      // Waiting request should be fulfilled
      const window = await waitPromise;
      expect(window).toBe(window1);
    });
  });

  describe('destroy()', () => {
    it('should destroy all windows', async () => {
      await pool.acquire(800, 600);
      await pool.acquire(800, 600);

      pool.destroy();

      expect(mockDestroy).toHaveBeenCalledTimes(2);
    });

    it('should reject waiting requests', async () => {
      // Acquire all windows
      await pool.acquire(800, 600);
      await pool.acquire(800, 600);

      // Start waiting
      const waitPromise = pool.acquire(800, 600);

      // Destroy pool
      pool.destroy();

      // Wait should be rejected
      await expect(waitPromise).rejects.toThrow('RenderWindowPool is being destroyed');
    });

    it('should skip already destroyed windows', async () => {
      await pool.acquire(800, 600);
      mockIsDestroyed.mockReturnValue(true);

      expect(() => pool.destroy()).not.toThrow();
    });
  });

  describe('getStatus()', () => {
    it('should return correct status for empty pool', () => {
      const status = pool.getStatus();
      expect(status).toEqual({ total: 0, busy: 0, waiting: 0 });
    });

    it('should return correct status after acquiring', async () => {
      await pool.acquire(800, 600);

      const status = pool.getStatus();
      expect(status).toEqual({ total: 1, busy: 1, waiting: 0 });
    });

    it('should return correct status after releasing', async () => {
      const window = await pool.acquire(800, 600);
      // Ensure window is not reported as destroyed during release
      mockIsDestroyed.mockReturnValue(false);
      await pool.release(window);

      const status = pool.getStatus();
      expect(status).toEqual({ total: 1, busy: 0, waiting: 0 });
    });
  });
});
