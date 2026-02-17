import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeStorage, shell } from 'electron';
import fs from 'fs';
import { windowManager } from '../../../../main/WindowManager.js';

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

/**
 * Helper: mock a successful token refresh response
 */
function mockTokenRefreshResponse(accessToken = 'test-access-token', refreshToken = 'mock-refresh-token') {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          access_token: accessToken,
          expires_in: 3600,
          refresh_token: refreshToken,
        },
      }),
  } as Response);
}

/**
 * Helper: mock a successful user profile response
 */
function mockUserProfileResponse(profile = { id: '1', email: 'test@test.com', name: 'Test' }) {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: profile,
      }),
  } as Response);
}

/**
 * Helper: set up stored refresh token in fs mocks
 */
function setupStoredRefreshToken(token = 'mock-refresh-token') {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(`encrypted:${token}`));
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
  vi.mocked(safeStorage.decryptString).mockReturnValue(token);
}

/**
 * Helper: fully authenticate the manager (initialize with stored token → refresh → profile)
 */
async function authenticateManager() {
  setupStoredRefreshToken();
  mockTokenRefreshResponse();
  mockUserProfileResponse();
  await authManager.initialize();
  vi.mocked(global.fetch).mockClear();
  vi.mocked(windowManager.sendToRenderer).mockClear();
}

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

    it('should restore session successfully with stored token', async () => {
      setupStoredRefreshToken();
      mockTokenRefreshResponse();
      mockUserProfileResponse();

      await authManager.initialize();

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual({ id: '1', email: 'test@test.com', name: 'Test' });

      // 2 fetch calls: refresh token + user profile (via fetchWithAuth)
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/api/v1/auth/token/refresh'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/v1/user/profile'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('should clear tokens when refresh fails during restore', async () => {
      setupStoredRefreshToken();

      // Mock refresh endpoint to fail
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      await authManager.initialize();

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should clear tokens when profile fetch fails during restore', async () => {
      setupStoredRefreshToken();
      mockTokenRefreshResponse();

      // Profile fetch returns 500
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 500,
        json: () => Promise.resolve({ success: false }),
      } as Response);

      await authManager.initialize();

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
    it('should clear state when not authenticated', async () => {
      await authManager.logout();

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      // No fetch call since accessToken is null
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should call logout API via fetchWithAuth and clear tokens when authenticated', async () => {
      await authenticateManager();

      // Mock the logout API call (via fetchWithAuth)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await authManager.logout();

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('should still clear tokens even if logout API returns 401 and refresh fails', async () => {
      await authenticateManager();

      // Logout API returns 401
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      // Refresh attempt fails
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      await authManager.logout();

      // fetchWithAuth throws, but logout catches it and still clears tokens
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

    it('should return valid token when authenticated', async () => {
      await authenticateManager();

      const token = await authManager.getAccessToken();
      expect(token).toBe('test-access-token');
      // No refresh call needed since token is still valid
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getUserProfile', () => {
    it('should return null when not authenticated', () => {
      const profile = authManager.getUserProfile();
      expect(profile).toBeNull();
    });
  });

  describe('fetchWithAuth', () => {
    it('should throw when not authenticated', async () => {
      await expect(authManager.fetchWithAuth('https://api.example.com/data')).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should attach token and return response on non-401', async () => {
      await authenticateManager();

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'ok' }),
      } as Response;
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      const res = await authManager.fetchWithAuth('https://api.example.com/data');

      expect(res).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('should retry with new token on 401 after successful refresh', async () => {
      await authenticateManager();

      // First call returns 401
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      // Refresh token call succeeds
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              access_token: 'new-access-token',
              expires_in: 3600,
              refresh_token: 'mock-refresh-token',
            },
          }),
      } as Response);

      // Retry call succeeds
      const retryResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'ok' }),
      } as Response;
      vi.mocked(global.fetch).mockResolvedValueOnce(retryResponse);

      const res = await authManager.fetchWithAuth('https://api.example.com/data');

      expect(res).toBe(retryResponse);
      // 3 calls: original request, refresh, retry
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenLastCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer new-access-token',
          }),
        }),
      );
    });

    it('should clear tokens and throw when refresh fails on 401', async () => {
      await authenticateManager();

      // First call returns 401
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      // Refresh token call fails
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      await expect(authManager.fetchWithAuth('https://api.example.com/data')).rejects.toThrow(
        'Authentication required',
      );

      const state = authManager.getAuthState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('should broadcast state change when clearing tokens on 401', async () => {
      await authenticateManager();

      // First call returns 401
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      // Refresh fails
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      await expect(authManager.fetchWithAuth('https://api.example.com/data')).rejects.toThrow();

      // Should have broadcast the cleared state
      expect(windowManager.sendToRenderer).toHaveBeenCalledWith(
        'auth:stateChanged',
        expect.objectContaining({ isAuthenticated: false }),
      );
    });

    it('should pass custom options to fetch', async () => {
      await authenticateManager();

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await authManager.fetchWithAuth('https://api.example.com/data', {
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'value' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });
  });
});
