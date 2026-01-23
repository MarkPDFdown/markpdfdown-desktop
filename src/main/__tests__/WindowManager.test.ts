import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

// Import after mock
import { windowManager } from '../WindowManager.js';

describe('WindowManager', () => {
  let mockWindow: any;

  beforeEach(() => {
    // Reset window manager state
    windowManager.setMainWindow(null);

    // Create mock BrowserWindow
    mockWindow = {
      isDestroyed: vi.fn(() => false),
      on: vi.fn(),
      webContents: {
        send: vi.fn(),
      },
    };
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = windowManager;
      const instance2 = windowManager;
      expect(instance1).toBe(instance2);
    });
  });

  describe('setMainWindow()', () => {
    it('should set main window', () => {
      windowManager.setMainWindow(mockWindow);
      expect(windowManager.getMainWindow()).toBe(mockWindow);
    });

    it('should register closed event handler', () => {
      windowManager.setMainWindow(mockWindow);
      expect(mockWindow.on).toHaveBeenCalledWith('closed', expect.any(Function));
    });

    it('should clear window on closed event', () => {
      windowManager.setMainWindow(mockWindow);

      // Get the closed handler and invoke it
      const closedHandler = mockWindow.on.mock.calls.find(
        (call: any[]) => call[0] === 'closed'
      )?.[1];
      closedHandler();

      expect(windowManager.getMainWindow()).toBeNull();
    });

    it('should allow setting window to null', () => {
      windowManager.setMainWindow(mockWindow);
      windowManager.setMainWindow(null);
      expect(windowManager.getMainWindow()).toBeNull();
    });

    it('should not register handler when setting null', () => {
      const onSpy = vi.fn();
      windowManager.setMainWindow(null);
      expect(onSpy).not.toHaveBeenCalled();
    });

    it('should replace existing window', () => {
      const window1 = { ...mockWindow, id: 1 };
      const window2 = { ...mockWindow, id: 2 };

      windowManager.setMainWindow(window1);
      windowManager.setMainWindow(window2);

      expect(windowManager.getMainWindow()).toBe(window2);
    });
  });

  describe('getMainWindow()', () => {
    it('should return null initially', () => {
      expect(windowManager.getMainWindow()).toBeNull();
    });

    it('should return set window', () => {
      windowManager.setMainWindow(mockWindow);
      expect(windowManager.getMainWindow()).toBe(mockWindow);
    });

    it('should return null after window closed', () => {
      windowManager.setMainWindow(mockWindow);

      const closedHandler = mockWindow.on.mock.calls.find(
        (call: any[]) => call[0] === 'closed'
      )?.[1];
      closedHandler();

      expect(windowManager.getMainWindow()).toBeNull();
    });
  });

  describe('isWindowAvailable()', () => {
    it('should return false when no window set', () => {
      expect(windowManager.isWindowAvailable()).toBe(false);
    });

    it('should return true when window is set and not destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(false);
      windowManager.setMainWindow(mockWindow);
      expect(windowManager.isWindowAvailable()).toBe(true);
    });

    it('should return false when window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);
      windowManager.setMainWindow(mockWindow);
      expect(windowManager.isWindowAvailable()).toBe(false);
    });

    it('should return false when window is null', () => {
      windowManager.setMainWindow(null);
      expect(windowManager.isWindowAvailable()).toBe(false);
    });

    it('should call isDestroyed on window', () => {
      windowManager.setMainWindow(mockWindow);
      windowManager.isWindowAvailable();
      expect(mockWindow.isDestroyed).toHaveBeenCalled();
    });
  });

  describe('sendToRenderer()', () => {
    it('should send message when window is available', () => {
      mockWindow.isDestroyed.mockReturnValue(false);
      windowManager.setMainWindow(mockWindow);

      windowManager.sendToRenderer('test-channel', 'arg1', 'arg2');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'test-channel',
        'arg1',
        'arg2'
      );
    });

    it('should not send when window is null', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      windowManager.setMainWindow(null);
      windowManager.sendToRenderer('test-channel', 'data');

      expect(mockWindow.webContents?.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Window not available')
      );

      consoleSpy.mockRestore();
    });

    it('should not send when window is destroyed', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockWindow.isDestroyed.mockReturnValue(true);
      windowManager.setMainWindow(mockWindow);

      windowManager.sendToRenderer('test-channel', 'data');

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Window not available')
      );

      consoleSpy.mockRestore();
    });

    it('should include channel name in warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      windowManager.setMainWindow(null);
      windowManager.sendToRenderer('my-channel');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('my-channel')
      );

      consoleSpy.mockRestore();
    });

    it('should handle multiple arguments', () => {
      mockWindow.isDestroyed.mockReturnValue(false);
      windowManager.setMainWindow(mockWindow);

      const arg1 = { data: 'test' };
      const arg2 = [1, 2, 3];
      const arg3 = 'string';

      windowManager.sendToRenderer('test-channel', arg1, arg2, arg3);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'test-channel',
        arg1,
        arg2,
        arg3
      );
    });

    it('should handle no additional arguments', () => {
      mockWindow.isDestroyed.mockReturnValue(false);
      windowManager.setMainWindow(mockWindow);

      windowManager.sendToRenderer('test-channel');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('test-channel');
    });
  });

  describe('window lifecycle integration', () => {
    it('should handle complete window lifecycle', () => {
      // Set window
      windowManager.setMainWindow(mockWindow);
      expect(windowManager.isWindowAvailable()).toBe(true);

      // Send message
      windowManager.sendToRenderer('test', 'data');
      expect(mockWindow.webContents.send).toHaveBeenCalled();

      // Simulate window closed
      const closedHandler = mockWindow.on.mock.calls.find(
        (call: any[]) => call[0] === 'closed'
      )?.[1];
      closedHandler();

      // Window should no longer be available
      expect(windowManager.isWindowAvailable()).toBe(false);
      expect(windowManager.getMainWindow()).toBeNull();
    });

    it('should handle window replacement', () => {
      const window1 = { ...mockWindow, id: 1 };
      const window2 = { ...mockWindow, id: 2, webContents: { send: vi.fn() } };

      windowManager.setMainWindow(window1);
      windowManager.setMainWindow(window2);

      windowManager.sendToRenderer('test', 'data');

      expect(window1.webContents.send).not.toHaveBeenCalled();
      expect(window2.webContents.send).toHaveBeenCalled();
    });
  });
});
