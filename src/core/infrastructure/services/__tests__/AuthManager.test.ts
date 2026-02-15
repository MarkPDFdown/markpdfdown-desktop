import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeStorage, shell } from 'electron';
import fs from 'fs';

// Mock WindowManager
vi.mock('../../../../main/WindowManager.js', () => ({
  windowManager: {
    sendToRenderer: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Dynamic import to get fresh instance
let authManager: any;

describe('AuthManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default: no stored refresh token
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Re-import to get fresh singleton
    const mod = await import('../AuthManager.js');
    authManager = mod.authManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAuthState', () => {
    it('should return default state', () => {
      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.deviceFlowStatus).toBe('idle');
      expect(state.userCode).toBeNull();
      expect(state.verificationUrl).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should complete without error when no stored token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await authManager.initialize();

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should attempt to restore session with stored token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('encrypted:mock-refresh-token'));
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(safeStorage.decryptString).mockReturnValue('mock-refresh-token');

      // Mock refresh endpoint to fail (token expired)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      await authManager.initialize();

      // Should have cleared tokens since refresh failed
      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('startDeviceLogin', () => {
    it('should call device code API and open browser', async () => {
      const mockDeviceCode = {
        device_code: 'test-device-code',
        user_code: 'ABCD-1234',
        verification_url: 'https://markdown.fit/device',
        expires_in: 600,
        interval: 5,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockDeviceCode }),
      } as Response);

      const result = await authManager.startDeviceLogin();

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/device/code'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(shell.openExternal).toHaveBeenCalledWith('https://markdown.fit/device');

      const state = authManager.getAuthState();
      expect(state.deviceFlowStatus).toBe('polling');
      expect(state.userCode).toBe('ABCD-1234');
      expect(state.verificationUrl).toBe('https://markdown.fit/device');
    });

    it('should handle API error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await authManager.startDeviceLogin();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      const state = authManager.getAuthState();
      expect(state.deviceFlowStatus).toBe('error');
    });
  });

  describe('cancelLogin', () => {
    it('should reset device flow state', async () => {
      const mockDeviceCode = {
        device_code: 'test-device-code',
        user_code: 'ABCD-1234',
        verification_url: 'https://markdown.fit/device',
        expires_in: 600,
        interval: 5,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockDeviceCode }),
      } as Response);

      await authManager.startDeviceLogin();
      authManager.cancelLogin();

      const state = authManager.getAuthState();
      expect(state.deviceFlowStatus).toBe('idle');
      expect(state.userCode).toBeNull();
      expect(state.verificationUrl).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear state and call logout API', async () => {
      // Mock logout API (fire-and-forget)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      await authManager.logout();

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('should return null when not authenticated', async () => {
      const token = await authManager.getAccessToken();
      expect(token).toBeNull();
    });
  });

  describe('getUserProfile', () => {
    it('should return null when not authenticated', () => {
      const profile = authManager.getUserProfile();
      expect(profile).toBeNull();
    });
  });
});
