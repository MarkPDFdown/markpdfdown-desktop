import { authManager } from './AuthManager.js';
import { API_BASE_URL } from '../config.js';
import { windowManager } from '../../../main/WindowManager.js';
import type { CloudSSEEvent, CloudSSEEventType } from '../../../shared/types/cloud-api.js';

const HEARTBEAT_TIMEOUT_MS = 90_000; // 90s without heartbeat triggers reconnect
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Event types that should be forwarded to the renderer */
const FORWARDABLE_EVENTS = new Set<CloudSSEEventType>([
  'pdf_ready',
  'page_started',
  'page_completed',
  'page_failed',
  'page_retry_started',
  'completed',
  'error',
  'cancelled',
]);

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
   * Connect to the global SSE endpoint.
   * Safe to call multiple times — tears down any existing connection first.
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      console.log('[CloudSSE] Already connected, skipping');
      return;
    }

    // Set flag synchronously before any await to prevent concurrent connect() calls
    this.connected = true;

    const token = await authManager.getAccessToken();
    if (!token) {
      console.log('[CloudSSE] No auth token, skipping connect');
      this.connected = false;
      return;
    }

    // If disconnect() was called while we were awaiting the token, bail out
    if (!this.connected) {
      console.log('[CloudSSE] Disconnected while obtaining token, aborting');
      return;
    }

    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    await this.startStream();
  }

  /**
   * Disconnect from SSE
   */
  public disconnect(): void {
    console.log('[CloudSSE] Disconnecting');
    this.connected = false;
    this.lastEventId = '0';
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
      if (!this.connected) return;
      await this.startStream();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private async startStream(): Promise<void> {
    // Abort any lingering previous stream before starting a new one
    if (this.abortController) {
      this.abortController.abort();
    }

    const url = `${API_BASE_URL}/api/v1/tasks/events`;
    this.abortController = new AbortController();

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    };

    if (this.lastEventId !== '0') {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    try {
      console.log('[CloudSSE] Connecting to', url);
      const res = await authManager.fetchWithAuth(url, {
        headers,
        signal: this.abortController.signal,
      });

      console.log(`[CloudSSE] Response status: ${res.status}, content-type: ${res.headers.get('content-type')}`);

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
      console.error('[CloudSSE] Stream error:', error?.message || error);
      this.reconnect();
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[CloudSSE] Stream ended after ${chunkCount} chunks`);
          break;
        }

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        console.log(`[CloudSSE] Chunk #${chunkCount} (${value.byteLength} bytes)`);
        buffer += chunk;

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
        console.error('[CloudSSE] Read error:', error?.message || error);
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
        // Per SSE spec, multi-line data fields are joined with newline
        if (data.length > 0) data += '\n';
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

    // Log non-heartbeat events for debugging
    if (eventType !== 'heartbeat') {
      console.log(`[CloudSSE] Event: type=${eventType}, id=${id || 'none'}, data=${data.substring(0, 200)}`);
    }

    // connected and heartbeat are control events, don't forward to renderer
    if (eventType === 'connected' || eventType === 'heartbeat') {
      return;
    }

    try {
      const parsedData = JSON.parse(data);

      if (!FORWARDABLE_EVENTS.has(eventType as CloudSSEEventType)) {
        console.warn(`[CloudSSE] Unknown event type: ${eventType}, skipping`);
        return;
      }

      const event: CloudSSEEvent = {
        type: eventType as CloudSSEEventType,
        data: parsedData,
      } as CloudSSEEvent;

      console.log(`[CloudSSE] Forwarding to renderer: type=${eventType}, task_id=${parsedData.task_id || 'none'}`);
      windowManager.sendToRenderer('cloud:taskEvent', event);
    } catch (error) {
      console.error('[CloudSSE] Failed to parse event data:', error, data);
    }
  }
}

export const cloudSSEManager = CloudSSEManager.getInstance();
