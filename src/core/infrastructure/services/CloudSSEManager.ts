import { authManager } from './AuthManager.js';
import { API_BASE_URL } from '../config.js';
import { windowManager } from '../../../main/WindowManager.js';
import type { CloudSSEEvent, CloudSSEEventType } from '../../../shared/types/cloud-api.js';

const HEARTBEAT_TIMEOUT_MS = 90_000; // 90s without heartbeat triggers reconnect
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

class CloudSSEManager {
  private static instance: CloudSSEManager;

  private abortController: AbortController | null = null;
  private lastEventId: string = '0';
  private reconnectDelay: number = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private connected: boolean = false;

  private constructor() {}

  public static getInstance(): CloudSSEManager {
    if (!CloudSSEManager.instance) {
      CloudSSEManager.instance = new CloudSSEManager();
    }
    return CloudSSEManager.instance;
  }

  /**
   * Connect to the global SSE endpoint
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      console.log('[CloudSSE] Already connected');
      return;
    }

    const token = await authManager.getAccessToken();
    if (!token) {
      console.log('[CloudSSE] No auth token, skipping connect');
      return;
    }

    this.connected = true;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    await this.startStream(token);
  }

  /**
   * Disconnect from SSE
   */
  public disconnect(): void {
    console.log('[CloudSSE] Disconnecting');
    this.connected = false;
    this.cleanup();
  }

  private cleanup(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    this.heartbeatTimer = setTimeout(() => {
      console.warn('[CloudSSE] Heartbeat timeout, reconnecting...');
      this.reconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private async reconnect(): Promise<void> {
    if (!this.connected) return;

    // Abort current stream
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    console.log(`[CloudSSE] Reconnecting in ${this.reconnectDelay}ms...`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const token = await authManager.getAccessToken();
      if (!token || !this.connected) return;
      await this.startStream(token);
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private async startStream(token: string): Promise<void> {
    const url = `${API_BASE_URL}/api/v1/tasks/events`;
    this.abortController = new AbortController();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    if (this.lastEventId !== '0') {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    try {
      console.log('[CloudSSE] Connecting to', url);
      const res = await fetch(url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        console.error(`[CloudSSE] HTTP error: ${res.status}`);
        this.reconnect();
        return;
      }

      if (!res.body) {
        console.error('[CloudSSE] No response body');
        this.reconnect();
        return;
      }

      // Reset backoff on successful connection
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.resetHeartbeatTimer();

      console.log('[CloudSSE] Connected, reading stream...');
      await this.readStream(res.body);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[CloudSSE] Stream aborted');
        return;
      }
      console.error('[CloudSSE] Stream error:', error);
      this.reconnect();
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (separated by double newline)
        const messages = buffer.split('\n\n');
        // Keep the last incomplete chunk in buffer
        buffer = messages.pop() || '';

        for (const msg of messages) {
          if (msg.trim()) {
            this.parseSSEMessage(msg);
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[CloudSSE] Read error:', error);
      }
    } finally {
      reader.releaseLock();
    }

    // Stream ended, reconnect if still connected
    if (this.connected) {
      this.reconnect();
    }
  }

  private parseSSEMessage(raw: string): void {
    let eventType = '';
    let data = '';
    let id = '';

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      }
    }

    if (id) {
      this.lastEventId = id;
    }

    if (!eventType || !data) return;

    // Reset heartbeat on any event
    this.resetHeartbeatTimer();

    try {
      const parsedData = JSON.parse(data);
      const event: CloudSSEEvent = {
        type: eventType as CloudSSEEventType,
        data: parsedData,
      } as CloudSSEEvent;

      // Forward to renderer
      windowManager.sendToRenderer('cloud:taskEvent', event);
    } catch (error) {
      console.error('[CloudSSE] Failed to parse event data:', error, data);
    }
  }
}

export const cloudSSEManager = CloudSSEManager.getInstance();
