import { app, safeStorage, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { API_BASE_URL } from '../config.js';
import { windowManager } from '../../../main/WindowManager.js';
import type {
  AuthState,
  CloudUserProfile,
  DeviceCodeResponse,
  TokenResponse,
  DeviceFlowStatus,
} from '../../../shared/types/cloud-api.js';

const REFRESH_TOKEN_DIR = 'auth';
const REFRESH_TOKEN_FILE = 'refresh_token.enc';
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000; // Refresh 1 minute before expiry
const DEVICE_POLL_INTERVAL_MS = 5000;

function buildUserAgent(): string {
  const appVersion = app.getVersion();
  const electronVersion = process.versions.electron;
  const chromeVersion = process.versions.chrome;
  const nodeVersion = process.versions.node;
  const platform = `${process.platform}; ${process.arch}`;
  return `MarkPDFdown/${appVersion} Electron/${electronVersion} Chrome/${chromeVersion} Node/${nodeVersion} (${platform})`;
}

class AuthManager {
  private static instance: AuthManager;

  private accessToken: string | null = null;
  private accessTokenExpiresAt: number = 0;
  private refreshToken: string | null = null;
  private userProfile: CloudUserProfile | null = null;
  private deviceFlowStatus: DeviceFlowStatus = 'idle';
  private userCode: string | null = null;
  private verificationUrl: string | null = null;
  private error: string | null = null;
  private isLoading: boolean = false;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private deviceCode: string | null = null;
  private pollExpiresAt: number = 0;

  private userAgent: string = '';

  private constructor() {}

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Initialize on app startup: restore session from persisted refresh token
   */
  public async initialize(): Promise<void> {
    console.log('[AuthManager] Initializing...');
    this.userAgent = buildUserAgent();
    console.log(`[AuthManager] User-Agent: ${this.userAgent}`);
    this.isLoading = true;
    this.broadcastState();

    try {
      const storedRefreshToken = this.loadRefreshToken();
      if (!storedRefreshToken) {
        console.log('[AuthManager] No stored refresh token, starting fresh');
        this.isLoading = false;
        this.broadcastState();
        return;
      }

      this.refreshToken = storedRefreshToken;
      await this.refreshAccessToken();
      await this.fetchUserProfile();
      console.log('[AuthManager] Session restored successfully');
    } catch (err) {
      console.warn('[AuthManager] Failed to restore session:', err);
      this.clearTokens();
    }

    this.isLoading = false;
    this.broadcastState();
  }

  /**
   * Start the device authorization login flow
   */
  public async startDeviceLogin(): Promise<{ success: boolean; error?: string }> {
    if (this.deviceFlowStatus === 'polling' || this.deviceFlowStatus === 'pending_browser') {
      return { success: false, error: 'Login already in progress' };
    }

    this.error = null;
    this.deviceFlowStatus = 'pending_browser';
    this.broadcastState();

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/device/code`, {
        method: 'POST',
        headers: this.getDefaultHeaders({ 'Content-Type': 'application/json' }),
      });

      if (!res.ok) {
        throw new Error(`Device code request failed: ${res.status}`);
      }

      const responseJson: { success: boolean; data: DeviceCodeResponse } = await res.json();

      if (!responseJson.success || !responseJson.data) {
        throw new Error(`Device code request failed: invalid response`);
      }

      const data = responseJson.data;
      this.deviceCode = data.device_code;
      this.userCode = data.user_code;
      this.verificationUrl = data.verification_url;
      this.pollExpiresAt = Date.now() + data.expires_in * 1000;

      // Open browser for user authorization
      shell.openExternal(data.verification_url);

      // Start polling
      this.deviceFlowStatus = 'polling';
      this.broadcastState();
      this.startPolling(data.interval || DEVICE_POLL_INTERVAL_MS / 1000);

      return { success: true };
    } catch (err) {
      console.error('[AuthManager] Device login failed:', err);
      this.deviceFlowStatus = 'error';
      this.error = err instanceof Error ? err.message : String(err);
      this.broadcastState();
      return { success: false, error: this.error };
    }
  }

  /**
   * Cancel an in-progress login flow
   */
  public cancelLogin(): void {
    this.stopPolling();
    this.deviceCode = null;
    this.userCode = null;
    this.verificationUrl = null;
    this.deviceFlowStatus = 'idle';
    this.error = null;
    this.broadcastState();
  }

  /**
   * Log out: call API, clear local tokens
   */
  public async logout(): Promise<void> {
    // Try to call logout API (fire-and-forget)
    if (this.accessToken) {
      try {
        await this.fetchWithAuth(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST' });
      } catch (err) {
        console.warn('[AuthManager] Logout API call failed:', err);
      }
    }

    this.clearTokens();
    this.broadcastState();
  }

  /**
   * Get a valid access token, refreshing if needed
   */
  public async getAccessToken(): Promise<string | null> {
    if (!this.accessToken || !this.refreshToken) {
      return null;
    }

    // If token is still valid (with margin), return it
    if (Date.now() < this.accessTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.accessToken;
    }

    // Token expired or about to expire, refresh
    try {
      await this.refreshAccessToken();
      return this.accessToken;
    } catch {
      this.clearTokens();
      this.broadcastState();
      return null;
    }
  }

  /**
   * Get current auth state snapshot
   */
  public getAuthState(): AuthState {
    return {
      isAuthenticated: !!this.accessToken && !!this.userProfile,
      isLoading: this.isLoading,
      user: this.userProfile,
      deviceFlowStatus: this.deviceFlowStatus,
      userCode: this.userCode,
      verificationUrl: this.verificationUrl,
      error: this.error,
    };
  }

  /**
   * Get cached user profile
   */
  public getUserProfile(): CloudUserProfile | null {
    return this.userProfile;
  }

  /**
   * Make an authenticated API request. Automatically retries once on 401 by refreshing the token.
   */
  public async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.getDefaultHeaders(),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (res.status !== 401) {
      return res;
    }

    // 401: attempt refresh
    if (!this.refreshToken) {
      this.clearTokens();
      this.broadcastState();
      throw new Error('Authentication required');
    }

    try {
      await this.refreshAccessToken();
    } catch {
      this.clearTokens();
      this.broadcastState();
      throw new Error('Authentication required');
    }

    // Retry with new token
    return fetch(url, {
      ...options,
      headers: {
        ...this.getDefaultHeaders(),
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private getDefaultHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      ...extra,
    };
  }

  private startPolling(intervalSeconds: number): void {
    const intervalMs = Math.max(intervalSeconds * 1000, DEVICE_POLL_INTERVAL_MS);

    const poll = async () => {
      if (Date.now() > this.pollExpiresAt) {
        this.deviceFlowStatus = 'expired';
        this.error = 'Device code expired';
        this.stopPolling();
        this.broadcastState();
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/auth/device/token?device_code=${encodeURIComponent(this.deviceCode!)}`,
          { headers: this.getDefaultHeaders() },
        );

        if (res.status === 200) {
          const responseJson: { success: boolean; data: TokenResponse } = await res.json();
          if (!responseJson.success || !responseJson.data) {
            throw new Error('Token polling failed: invalid response');
          }
          this.handleTokenResponse(responseJson.data);
          this.stopPolling();
          this.deviceFlowStatus = 'idle';
          this.userCode = null;
          this.verificationUrl = null;
          this.deviceCode = null;

          await this.fetchUserProfile();
          this.broadcastState();
          return;
        }

        if (res.status === 428) {
          // authorization_pending — keep polling
          this.pollTimer = setTimeout(poll, intervalMs);
          return;
        }

        // Other error
        const body = await res.text();
        throw new Error(`Token polling failed: ${res.status} ${body}`);
      } catch (err) {
        if (this.deviceFlowStatus === 'polling') {
          // Network error, retry
          console.warn('[AuthManager] Poll error, retrying:', err);
          this.pollTimer = setTimeout(poll, intervalMs);
        }
      }
    };

    this.pollTimer = setTimeout(poll, intervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private handleTokenResponse(data: TokenResponse): void {
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

    // Only persist refresh token if it exists (web login may not provide it)
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
      this.persistRefreshToken(data.refresh_token);
    } else {
      console.warn('[AuthManager] No refresh_token in response, skipping persistence');
    }

    this.scheduleTokenRefresh(data.expires_in);
  }

  private scheduleTokenRefresh(expiresInSeconds: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Skip auto-refresh if no refresh token available
    if (!this.refreshToken) {
      console.log('[AuthManager] No refresh token, skipping auto-refresh schedule');
      return;
    }

    const refreshInMs = Math.max((expiresInSeconds * 1000) - TOKEN_REFRESH_MARGIN_MS, 0);
    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshAccessToken();
      } catch (err) {
        console.error('[AuthManager] Auto-refresh failed:', err);
        this.clearTokens();
        this.broadcastState();
      }
    }, refreshInMs);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/auth/token/refresh`, {
      method: 'POST',
      headers: this.getDefaultHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status}`);
    }

    const responseJson: { success: boolean; data: TokenResponse } = await res.json();
    if (!responseJson.success || !responseJson.data) {
      throw new Error('Token refresh failed: invalid response');
    }
    this.handleTokenResponse(responseJson.data);
  }

  private async fetchUserProfile(): Promise<void> {
    if (!this.accessToken) return;

    const res = await this.fetchWithAuth(`${API_BASE_URL}/api/v1/user/profile`);

    if (!res.ok) {
      throw new Error(`Fetch user profile failed: ${res.status}`);
    }

    const responseJson: { success: boolean; data: CloudUserProfile } = await res.json();
    if (!responseJson.success || !responseJson.data) {
      throw new Error('Fetch user profile failed: invalid response');
    }
    this.userProfile = responseJson.data;
  }

  private persistRefreshToken(token: string): void {
    try {
      const dir = path.join(app.getPath('userData'), REFRESH_TOKEN_DIR);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, REFRESH_TOKEN_FILE);

      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token);
        fs.writeFileSync(filePath, encrypted);
      } else {
        // Fallback: store as plain text (not ideal but functional)
        fs.writeFileSync(filePath, token, 'utf-8');
      }
    } catch (err) {
      console.warn('[AuthManager] Failed to persist refresh token:', err);
    }
  }

  private loadRefreshToken(): string | null {
    try {
      const filePath = path.join(app.getPath('userData'), REFRESH_TOKEN_DIR, REFRESH_TOKEN_FILE);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath);

      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(data);
      } else {
        return data.toString('utf-8');
      }
    } catch (err) {
      console.warn('[AuthManager] Failed to load refresh token:', err);
      return null;
    }
  }

  private deleteRefreshToken(): void {
    try {
      const filePath = path.join(app.getPath('userData'), REFRESH_TOKEN_DIR, REFRESH_TOKEN_FILE);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('[AuthManager] Failed to delete refresh token:', err);
    }
  }

  private clearTokens(): void {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.refreshToken = null;
    this.userProfile = null;
    this.error = null;
    this.deviceFlowStatus = 'idle';
    this.userCode = null;
    this.verificationUrl = null;
    this.deviceCode = null;
    this.stopPolling();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.deleteRefreshToken();
  }

  private broadcastState(): void {
    windowManager.sendToRenderer('auth:stateChanged', this.getAuthState());
  }
}

export const authManager = AuthManager.getInstance();
