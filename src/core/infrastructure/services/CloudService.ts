import fs from 'fs/promises';
import path from 'path';
import { authManager } from './AuthManager.js';
import { API_BASE_URL } from '../config.js';
import type {
  CreditsApiResponse,
  CreditTransactionApiItem,
  CreateTaskResponse,
  CloudTaskResponse,
  CloudTaskPageResponse,
  CloudTaskResult,
  CloudCancelTaskResponse,
  CloudRetryPageResponse,
  CloudApiPagination,
  PaymentCheckoutApiResponse,
  PaymentCheckoutStatusApiResponse,
  PaymentHistoryApiItem,
} from '../../../shared/types/cloud-api.js';

const PAYMENT_STATUSES = new Set(['pending', 'completed', 'failed', 'refunded']);
const PAYMENT_PROVIDER_STATUSES = new Set([
  'pending',
  'processing',
  'completed',
  'failed',
  'canceled',
  'expired',
  'refunded',
  'unknown',
]);

/**
 * CloudService handles interaction with the MarkPDFDown Cloud API
 */
class CloudService {
  private static instance: CloudService;

  private constructor() {}

  private extractDownloadFileName(contentDisposition: string, fallback: string): string {
    const rfc5987Name = this.parseRFC5987Filename(contentDisposition);
    if (rfc5987Name) {
      return this.sanitizeDownloadFileName(rfc5987Name, fallback);
    }

    const plainName = this.parsePlainFilename(contentDisposition);
    if (!plainName) {
      return this.sanitizeDownloadFileName(fallback, fallback);
    }

    const repairedName = this.tryRepairUtf8Mojibake(plainName);
    return this.sanitizeDownloadFileName(repairedName || plainName, fallback);
  }

  private parseRFC5987Filename(contentDisposition: string): string | null {
    const match = contentDisposition.match(/filename\*\s*=\s*([^;]+)/i);
    if (!match) return null;

    const rawValue = match[1]?.trim();
    if (!rawValue) return null;

    const unquoted = rawValue.replace(/^"(.*)"$/, '$1');
    const parts = unquoted.match(/^([^']*)'[^']*'(.*)$/);
    if (!parts) return null;

    const charset = (parts[1] || 'utf-8').trim().toLowerCase();
    const encodedValue = parts[2] || '';

    try {
      if (charset === 'utf-8' || charset === 'utf8') {
        return decodeURIComponent(encodedValue);
      }

      const bytes = this.percentDecodeToBytes(encodedValue);
      if (charset === 'iso-8859-1' || charset === 'latin1') {
        return Buffer.from(bytes).toString('latin1');
      }
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return null;
    }
  }

  private parsePlainFilename(contentDisposition: string): string | null {
    const match = contentDisposition.match(/filename\s*=\s*("(?:\\.|[^"])*"|[^;]+)/i);
    if (!match) return null;

    let value = match[1]?.trim();
    if (!value) return null;

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }

    return value;
  }

  private percentDecodeToBytes(input: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '%' && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        const parsed = Number.parseInt(hex, 16);
        if (!Number.isNaN(parsed)) {
          bytes.push(parsed);
          i += 2;
          continue;
        }
      }
      bytes.push(input.charCodeAt(i));
    }
    return bytes;
  }

  private tryRepairUtf8Mojibake(input: string): string | null {
    const hasCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(input);
    if (hasCjk) return null;

    const latinSupplementCount = Array.from(input).filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x00c0 && code <= 0x00ff;
    }).length;
    if (latinSupplementCount < 2) return null;

    const repaired = Buffer.from(input, 'latin1').toString('utf8');
    if (!repaired) return null;

    const repairedHasCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(repaired);
    const roundTrip = Buffer.from(repaired, 'utf8').toString('latin1') === input;
    if (repairedHasCjk && roundTrip) {
      return repaired;
    }
    return null;
  }

  private sanitizeDownloadFileName(input: string, fallback: string): string {
    // Sanitize: extract basename and strip control/reserved characters
    // eslint-disable-next-line no-control-regex
    return path.basename(input).replace(/[\u0000-\u001f<>:"|?*]/g, '_') || fallback;
  }

  private normalizeCheckoutStatus(data: any): PaymentCheckoutStatusApiResponse | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const sessionId = typeof data.session_id === 'string' ? data.session_id.trim() : '';
    const status = typeof data.status === 'string' ? data.status : '';
    const providerStatus = typeof data.provider_status === 'string' ? data.provider_status : '';
    const amountUsd = Number(data.amount_usd);
    const creditsAdded = Number(data.credits_added);
    const createdAt = typeof data.created_at === 'string' ? data.created_at : '';

    if (!sessionId || !PAYMENT_STATUSES.has(status)) {
      return null;
    }
    if (!providerStatus || !PAYMENT_PROVIDER_STATUSES.has(providerStatus)) {
      return null;
    }
    if (!Number.isFinite(amountUsd) || !Number.isFinite(creditsAdded)) {
      return null;
    }
    if (typeof data.is_final !== 'boolean' || typeof data.changed !== 'boolean') {
      return null;
    }
    if (!createdAt) {
      return null;
    }

    return {
      session_id: sessionId,
      order_id: typeof data.order_id === 'string' ? data.order_id : undefined,
      status,
      provider_status: providerStatus,
      is_final: data.is_final,
      changed: data.changed,
      amount_usd: amountUsd,
      credits_added: creditsAdded,
      created_at: createdAt,
    };
  }

  public static getInstance(): CloudService {
    if (!CloudService.instance) {
      CloudService.instance = new CloudService();
    }
    return CloudService.instance;
  }

  /**
   * Convert a file using the cloud API
   * @param fileData - File data with either path (local file) or content (ArrayBuffer)
   * @returns Task creation response with task_id and events_url
   */
  public async convert(fileData: {
    path?: string;
    content?: ArrayBuffer;
    name: string;
    model?: string;
    page_range?: string;
  }): Promise<{
    success: boolean;
    data?: CreateTaskResponse;
    error?: string;
  }> {
    try {
      const token = await authManager.getAccessToken();
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const model = fileData.model || 'lite';
      console.log('[CloudService] Starting cloud conversion for:', fileData.name, 'model:', model);

      // Build FormData for file upload
      const formData = new FormData();

      // Add file to form data
      let fileBuffer: ArrayBuffer;
      if (fileData.content) {
        fileBuffer = fileData.content;
      } else if (fileData.path) {
        const buffer = await fs.readFile(fileData.path);
        fileBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } else {
        return { success: false, error: 'No file content or path provided' };
      }

      const blob = new Blob([fileBuffer]);
      formData.append('file', blob, fileData.name);

      // Add model and language parameters
      formData.append('model', model);
      formData.append('language', 'auto');

      // Add page_range if specified
      if (fileData.page_range) {
        formData.append('page_range', fileData.page_range);
      }

      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/convert`, {
        method: 'POST',
        body: formData,
        // Note: Do NOT set Content-Type manually - let the browser/fetch set it with proper boundary
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const errorMessage = errorBody?.error?.message || `Upload failed: ${res.status}`;
        console.error('[CloudService] Convert API error:', errorMessage);
        return { success: false, error: errorMessage };
      }

      const responseJson: { success: boolean; data: CreateTaskResponse } = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid response from server' };
      }

      console.log('[CloudService] Task created:', responseJson.data.task_id);
      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] convert error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get tasks from the cloud API
   */
  public async getTasks(page: number = 1, pageSize: number = 10): Promise<{
    success: boolean;
    data?: CloudTaskResponse[];
    pagination?: CloudApiPagination;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/tasks?${params.toString()}`,
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch tasks: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success) {
        return { success: false, error: responseJson.error?.message || 'Invalid tasks response' };
      }

      return {
        success: true,
        data: responseJson.data,
        pagination: responseJson.pagination,
      };
    } catch (error) {
      console.error('[CloudService] getTasks error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get a single task by ID
   */
  public async getTaskById(id: string): Promise<{
    success: boolean;
    data?: CloudTaskResponse;
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}`);

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch task: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid task response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] getTaskById error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get pages for a task
   */
  public async getTaskPages(id: string, page: number = 1, pageSize: number = 50): Promise<{
    success: boolean;
    data?: CloudTaskPageResponse[];
    pagination?: CloudApiPagination;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}/pages?${params.toString()}`,
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch task pages: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success) {
        return { success: false, error: responseJson.error?.message || 'Invalid pages response' };
      }

      return {
        success: true,
        data: responseJson.data,
        pagination: responseJson.pagination,
      };
    } catch (error) {
      console.error('[CloudService] getTaskPages error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Cancel a task
   */
  public async cancelTask(id: string): Promise<{
    success: boolean;
    data?: CloudCancelTaskResponse;
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to cancel task: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid cancel response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] cancelTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Retry an entire task (creates a new task)
   */
  public async retryTask(id: string): Promise<{
    success: boolean;
    data?: CreateTaskResponse;
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to retry task: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid retry response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] retryTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Retry a single page
   */
  public async retryPage(taskId: string, pageNumber: number): Promise<{
    success: boolean;
    data?: CloudRetryPageResponse;
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(taskId)}/pages/${encodeURIComponent(String(pageNumber))}/retry`,
        { method: 'POST' },
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to retry page: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid page retry response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] retryPage error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get task conversion result (merged markdown)
   */
  public async getTaskResult(id: string): Promise<{
    success: boolean;
    data?: CloudTaskResult;
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}/result`, {}, { timeoutMs: 0 });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch result: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid result response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] getTaskResult error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Download PDF file for a task
   */
  public async downloadPdf(id: string): Promise<{
    success: boolean;
    data?: { buffer: ArrayBuffer; fileName: string };
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}/pdf`, {}, { timeoutMs: 0 });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to download PDF: ${res.status}`,
        };
      }

      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const fallbackName = `task-${id}.pdf`;
      const fileName = this.extractDownloadFileName(contentDisposition, fallbackName);

      const buffer = await res.arrayBuffer();
      return { success: true, data: { buffer, fileName } };
    } catch (error) {
      console.error('[CloudService] downloadPdf error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get page image via proxy (for relative API paths that need auth)
   */
  public async getPageImage(taskId: string, pageNumber: number): Promise<{
    success: boolean;
    data?: { dataUrl: string };
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(taskId)}/pages/${encodeURIComponent(String(pageNumber))}/image`,
        {},
        { timeoutMs: 0 },
      );

      if (!res.ok) {
        return {
          success: false,
          error: `Failed to fetch page image: ${res.status}`,
        };
      }

      const contentType = res.headers.get('Content-Type') || 'image/png';
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;

      return { success: true, data: { dataUrl } };
    } catch (error) {
      console.error('[CloudService] getPageImage error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create payment checkout session
   */
  public async createCheckout(amountUsd: number): Promise<{
    success: boolean;
    data?: PaymentCheckoutApiResponse;
    error?: string;
  }> {
    try {
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        return { success: false, error: 'Invalid top-up amount' };
      }

      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/payment/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_usd: amountUsd }),
      });

      const responseJson = await res.json().catch(() => null);
      if (!res.ok || !responseJson?.success) {
        const serverMessage = responseJson?.error?.message;
        const allowedAmounts = responseJson?.error?.details?.allowed_amounts_usd;
        const allowedSuffix = Array.isArray(allowedAmounts) && allowedAmounts.length > 0
          ? ` (allowed: ${allowedAmounts.join(', ')})`
          : '';

        return {
          success: false,
          error: serverMessage
            ? `${serverMessage}${allowedSuffix}`
            : `Failed to create checkout session: ${res.status}`,
        };
      }

      if (!responseJson.data?.checkout_url || !responseJson.data?.session_id) {
        return { success: false, error: 'Invalid checkout response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] createCheckout error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Query checkout order status by session_id (supports long polling)
   */
  public async getCheckoutStatus(sessionId: string, waitSeconds: number = 10): Promise<{
    success: boolean;
    data?: PaymentCheckoutStatusApiResponse;
    error?: string;
  }> {
    try {
      const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
      if (!normalizedSessionId) {
        return { success: false, error: 'Invalid checkout session id' };
      }

      if (!Number.isFinite(waitSeconds)) {
        return { success: false, error: 'Invalid wait_seconds' };
      }
      const normalizedWaitSeconds = Math.min(30, Math.max(0, Math.floor(waitSeconds)));

      const params = new URLSearchParams({
        wait_seconds: String(normalizedWaitSeconds),
      });

      // Long-polling endpoint can hold the connection up to wait_seconds.
      // Leave enough headroom for network jitter/proxy buffering to avoid local abort.
      const requestTimeoutMs = Math.max((normalizedWaitSeconds + 20) * 1000, 30000);

      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/payment/checkout/${encodeURIComponent(normalizedSessionId)}/status?${params.toString()}`,
        {},
        { timeoutMs: requestTimeoutMs },
      );

      const responseJson = await res.json().catch(() => null);
      if (!res.ok || !responseJson?.success) {
        return {
          success: false,
          error: responseJson?.error?.message || `Failed to query checkout status: ${res.status}`,
        };
      }

      const data = this.normalizeCheckoutStatus(responseJson.data);
      if (!data) {
        return { success: false, error: 'Invalid checkout status response' };
      }

      return { success: true, data };
    } catch (error) {
      console.error('[CloudService] getCheckoutStatus error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Trigger proactive reconciliation for a checkout session
   */
  public async reconcileCheckout(sessionId: string): Promise<{
    success: boolean;
    data?: PaymentCheckoutStatusApiResponse;
    error?: string;
  }> {
    try {
      const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
      if (!normalizedSessionId) {
        return { success: false, error: 'Invalid checkout session id' };
      }

      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/payment/checkout/${encodeURIComponent(normalizedSessionId)}/reconcile`,
        { method: 'POST' },
      );

      const responseJson = await res.json().catch(() => null);
      if (!res.ok || !responseJson?.success) {
        return {
          success: false,
          error: responseJson?.error?.message || `Failed to reconcile checkout: ${res.status}`,
        };
      }

      const data = this.normalizeCheckoutStatus(responseJson.data);
      if (!data) {
        return { success: false, error: 'Invalid checkout reconcile response' };
      }

      return { success: true, data };
    } catch (error) {
      console.error('[CloudService] reconcileCheckout error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get credits info from the cloud API
   */
  public async getCredits(): Promise<{
    success: boolean;
    data?: CreditsApiResponse;
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/credits`);

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch credits: ${res.status}`,
        };
      }

      const responseJson: { success: boolean; data: CreditsApiResponse } = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid credits response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] getCredits error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get credit history (transactions) from the cloud API
   */
  public async getCreditHistory(
    page: number = 1,
    pageSize: number = 20,
    type?: string,
  ): Promise<{
    success: boolean;
    data?: CreditTransactionApiItem[];
    pagination?: { page: number; page_size: number; total: number; total_pages: number };
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (type) {
        params.set('type', type);
      }

      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/credits/transactions?${params.toString()}`,
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch credit history: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success) {
        return { success: false, error: responseJson.error?.message || 'Invalid credit history response' };
      }

      return {
        success: true,
        data: responseJson.data,
        pagination: responseJson.pagination,
      };
    } catch (error) {
      console.error('[CloudService] getCreditHistory error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get payment history from the cloud API
   */
  public async getPaymentHistory(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    success: boolean;
    data?: PaymentHistoryApiItem[];
    pagination?: { page: number; page_size: number; total: number; total_pages: number };
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      const res = await authManager.fetchWithAuth(
        `${API_BASE_URL}/api/v1/payment/history?${params.toString()}`,
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to fetch payment history: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success) {
        return { success: false, error: responseJson.error?.message || 'Invalid payment history response' };
      }

      return {
        success: true,
        data: responseJson.data,
        pagination: responseJson.pagination,
      };
    } catch (error) {
      console.error('[CloudService] getPaymentHistory error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete a cloud task (only terminal states can be deleted)
   * Terminal states: FAILED=0, COMPLETED=6, CANCELLED=7, PARTIAL_FAILED=8
   */
  public async deleteTask(id: string): Promise<{
    success: boolean;
    data?: { id: string; message: string };
    error?: string;
  }> {
    try {
      const res = await authManager.fetchWithAuth(`${API_BASE_URL}/api/v1/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        return {
          success: false,
          error: errorBody?.error?.message || `Failed to delete task: ${res.status}`,
        };
      }

      const responseJson = await res.json();
      if (!responseJson.success || !responseJson.data) {
        return { success: false, error: 'Invalid delete response' };
      }

      return { success: true, data: responseJson.data };
    } catch (error) {
      console.error('[CloudService] deleteTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export default CloudService.getInstance();
