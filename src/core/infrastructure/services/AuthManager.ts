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
const INIT_RETRY_DELAY_MS = 30 * 1000; // Retry initialization after 30 seconds on transient failure
const MAX_AUTO_REFRESH_RETRIES = 3; // Max retries for scheduled auto-refresh

/**
 * Thrown when the refresh token is definitively invalid (e.g. revoked, expired)
 * and the user must re-authenticate.
 */
class AuthTokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthTokenInvalidError';
  }
}

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
  private initRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private autoRefreshRetryCount: number = 0;
  private deviceCode: string | null = null;
  private pollExpiresAt: number = 0;

  private userAgent: string = '';
  private refreshInFlight: Promise<void> | null = null;

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
      // Only clear tokens if the refresh token is definitively invalid (auth error).
      // For transient errors (network, server), keep the refresh token so we can retry later.
      if (err instanceof AuthTokenInvalidError) {
        this.clearTokens();
      } else {
        // Keep refresh token on disk, clear only in-memory access token
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        this.userProfile = null;
        // Schedule a retry after a delay
        this.scheduleInitRetry();
      }
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
      try {
        await shell.openExternal(data.verification_url);
      } catch (browserErr) {
        console.error('[AuthManager] Failed to open browser:', browserErr);
        this.deviceFlowStatus = 'error';
        this.error = 'Failed to open browser for authorization';
        this.broadcastState();
        return { success: false, error: this.error };
      }

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
   * Check device token status immediately (for OAuth callback)
   * Call this when receiving protocol URL callback to speed up token acquisition
   */
  public async checkDeviceTokenStatus(): Promise<void> {
    if (!this.deviceCode || this.deviceFlowStatus !== 'polling') {
      return;
    }

    console.log('[AuthManager] Checking device token status immediately...');

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/auth/device/token?device_code=${encodeURIComponent(this.deviceCode)}`,
        { headers: this.getDefaultHeaders() },
      );

      if (res.status === 200) {
        const responseJson: { success: boolean; data: TokenResponse } = await res.json();
        if (!responseJson.success || !responseJson.data) {
          throw new Error('Token check failed: invalid response');
        }
        this.handleTokenResponse(responseJson.data);
        this.stopPolling();
        this.deviceFlowStatus = 'idle';
        this.userCode = null;
        this.verificationUrl = null;
        this.deviceCode = null;

        await this.fetchUserProfile();
        this.broadcastState();
        console.log('[AuthManager] Token obtained via immediate check');
        return;
      }

      if (res.status === 428) {
        // Still pending, let polling continue
        console.log('[AuthManager] Still waiting, polling will continue...');
        return;
      }

      const body = await res.text();
      console.warn('[AuthManager] Token check error:', res.status, body);
    } catch (err) {
      console.warn('[AuthManager] Token check failed:', err);
      // Let polling continue on error
    }
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
    if (!this.refreshToken) {
      return null;
    }

    // If token is still valid (with margin), return it
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.accessToken;
    }

    // Token expired or about to expire, refresh
    try {
      await this.refreshAccessToken();
      return this.accessToken;
    } catch (err) {
      if (err instanceof AuthTokenInvalidError) {
        // Refresh token is definitively invalid, clear everything
        this.clearTokens();
        this.broadcastState();
      }
      // For transient errors, don't clear the refresh token — let caller handle the failure
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
   * @param url - Request URL
   * @param options - Fetch RequestInit options
   * @param meta - Additional options: timeoutMs (0 = no timeout, default auto-detected from body type)
   */
  public async fetchWithAuth(url: string, options: RequestInit = {}, meta?: { timeoutMs?: number }): Promise<Response> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    // Determine timeout: explicit meta > auto-detect from body type > default 8s
    const isFormData = options.body instanceof FormData;
    const timeoutMs = meta?.timeoutMs !== undefined ? meta.timeoutMs : isFormData ? 120 * 1000 : 8000;
    const callerSignal = options.signal;

    // Build composite signal: combine caller signal with timeout
    const buildSignal = (): { signal: AbortSignal | undefined; timeoutId: ReturnType<typeof setTimeout> | null } => {
      const signals: AbortSignal[] = [];
      let tid: ReturnType<typeof setTimeout> | null = null;

      if (callerSignal) signals.push(callerSignal);
      if (timeoutMs > 0) {
        const tc = new AbortController();
        tid = setTimeout(() => tc.abort(), timeoutMs);
        signals.push(tc.signal);
      }

      if (signals.length === 0) return { signal: undefined, timeoutId: null };
      if (signals.length === 1) return { signal: signals[0], timeoutId: tid };
      // Compose multiple signals (with fallback for older runtimes)
      if (typeof AbortSignal.any === 'function') {
        return { signal: AbortSignal.any(signals), timeoutId: tid };
      }
      // Fallback: wire signals to a shared AbortController
      const fc = new AbortController();
      for (const s of signals) {
        if (s.aborted) { fc.abort(s.reason); break; }
        s.addEventListener('abort', () => fc.abort(s.reason), { once: true });
      }
      return { signal: fc.signal, timeoutId: tid };
    };

    const { signal, timeoutId } = buildSignal();

    try {
      const res = await fetch(url, {
        ...options,
        signal,
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
      } catch (err) {
        if (err instanceof AuthTokenInvalidError) {
          this.clearTokens();
          this.broadcastState();
        }
        throw new Error('Authentication required');
      }

      // Retry with new token (rebuild signal for retry)
      const { signal: retrySignal, timeoutId: retryTimeoutId } = buildSignal();

      try {
        return await fetch(url, {
          ...options,
          signal: retrySignal,
          headers: {
            ...this.getDefaultHeaders(),
            Authorization: `Bearer ${this.accessToken}`,
            ...options.headers,
          },
        });
      } finally {
        if (retryTimeoutId) clearTimeout(retryTimeoutId);
      }
    } catch (error: any) {
      // Normalize timeout AbortError to a clear message
      if (error?.name === 'AbortError' && callerSignal?.aborted) {
        throw error; // Caller-initiated abort, re-throw as-is
      }
      if (error?.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
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
        if (err instanceof AuthTokenInvalidError) {
          // Refresh token is definitively invalid
          this.clearTokens();
          this.broadcastState();
        } else {
          // Transient error — retry with exponential backoff
          this.autoRefreshRetryCount++;
          if (this.autoRefreshRetryCount <= MAX_AUTO_REFRESH_RETRIES) {
            const retryDelayMs = Math.min(30000 * Math.pow(2, this.autoRefreshRetryCount - 1), 5 * 60 * 1000);
            console.log(`[AuthManager] Scheduling auto-refresh retry ${this.autoRefreshRetryCount}/${MAX_AUTO_REFRESH_RETRIES} in ${retryDelayMs / 1000}s`);
            this.refreshTimer = setTimeout(async () => {
              try {
                await this.refreshAccessToken();
              } catch (retryErr) {
                console.error('[AuthManager] Auto-refresh retry failed:', retryErr);
                if (retryErr instanceof AuthTokenInvalidError) {
                  this.clearTokens();
                  this.broadcastState();
                } else if (this.autoRefreshRetryCount < MAX_AUTO_REFRESH_RETRIES) {
                  // Schedule another retry via recursive call
                  this.scheduleTokenRefresh(retryDelayMs / 1000);
                } else {
                  console.error('[AuthManager] Max auto-refresh retries reached, keeping refresh token for next manual attempt');
                }
              }
            }, retryDelayMs);
          } else {
            console.error('[AuthManager] Max auto-refresh retries reached, keeping refresh token for next manual attempt');
          }
        }
      }
    }, refreshInMs);
  }

  private async refreshAccessToken(): Promise<void> {
    // Deduplicate concurrent refresh calls
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.doRefreshAccessToken();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async doRefreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthTokenInvalidError('No refresh token available');
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/v1/auth/token/refresh`, {
        method: 'POST',
        headers: this.getDefaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
    } catch (err) {
      // Network error (offline, DNS failure, etc.) — transient, don't invalidate refresh token
      throw new Error(`Token refresh network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!res.ok) {
      // 401/403 means the refresh token itself is invalid or revoked
      if (res.status === 401 || res.status === 403) {
        throw new AuthTokenInvalidError(`Token refresh rejected: ${res.status}`);
      }
      // Other HTTP errors (500, 502, 503, etc.) are transient server errors
      throw new Error(`Token refresh server error: ${res.status}`);
    }

    const responseJson: { success: boolean; data: TokenResponse } = await res.json();
    if (!responseJson.success || !responseJson.data) {
      throw new Error('Token refresh failed: invalid response');
    }
    this.handleTokenResponse(responseJson.data);
    // Reset retry count on successful refresh
    this.autoRefreshRetryCount = 0;
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
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[AuthManager] Encryption not available, refresh token will only be kept in memory (not persisted to disk)');
        return;
      }

      const dir = path.join(app.getPath('userData'), REFRESH_TOKEN_DIR);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, REFRESH_TOKEN_FILE);
      const encrypted = safeStorage.encryptString(token);
      fs.writeFileSync(filePath, encrypted);
    } catch (err) {
      console.warn('[AuthManager] Failed to persist refresh token:', err);
    }
  }

  private loadRefreshToken(): string | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[AuthManager] Encryption not available, cannot load persisted refresh token');
        return null;
      }

      const filePath = path.join(app.getPath('userData'), REFRESH_TOKEN_DIR, REFRESH_TOKEN_FILE);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath);
      return safeStorage.decryptString(data);
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

  /**
   * Schedule a retry of initialization after a transient failure.
   * The refresh token is still stored on disk, so we just need to try refreshing again.
   */
  private scheduleInitRetry(): void {
    if (this.initRetryTimer) {
      clearTimeout(this.initRetryTimer);
    }

    console.log(`[AuthManager] Scheduling init retry in ${INIT_RETRY_DELAY_MS / 1000}s`);
    this.initRetryTimer = setTimeout(async () => {
      this.initRetryTimer = null;
      if (this.accessToken || !this.refreshToken) {
        // Already recovered or token was cleared
        return;
      }

      console.log('[AuthManager] Retrying session restoration...');
      try {
        await this.refreshAccessToken();
        await this.fetchUserProfile();
        console.log('[AuthManager] Session restored on retry');
        this.broadcastState();
      } catch (err) {
        console.warn('[AuthManager] Init retry failed:', err);
        if (err instanceof AuthTokenInvalidError) {
          this.clearTokens();
          this.broadcastState();
        }
        // For transient errors, user can still trigger refresh via any API call
      }
    }, INIT_RETRY_DELAY_MS);
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
    this.autoRefreshRetryCount = 0;
    this.stopPolling();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.initRetryTimer) {
      clearTimeout(this.initRetryTimer);
      this.initRetryTimer = null;
    }
    this.deleteRefreshToken();
  }

  private broadcastState(): void {
    windowManager.sendToRenderer('auth:stateChanged', this.getAuthState());
  }
}

export const authManager = AuthManager.getInstance();
