export type DeviceFlowStatus = 'idle' | 'pending_browser' | 'polling' | 'expired' | 'error';

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CloudUserProfile | null;
  deviceFlowStatus: DeviceFlowStatus;
  userCode: string | null;
  verificationUrl: string | null;
  error: string | null;
}

export interface CloudUserProfile {
  id: number;
  clerk_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// ============ Credits API Types ============

export interface CreditsApiResponse {
  bonus: {
    balance: number;
    daily_used: number;
    daily_limit: number;
    daily_remaining: number;
    daily_reset_at: string;
    monthly_reset_at: string;
  };
  paid: {
    balance: number;
  };
  total_available: number;
}

export type CreditTransactionType =
  | 'topup'
  | 'consume'
  | 'consume_settle'
  | 'refund'
  | 'bonus_grant'
  | 'bonus_expire'
  | 'page_retry';

export interface CreditTransactionApiItem {
  id: number;
  type: CreditTransactionType;
  type_name: string;
  amount: number;
  balance_after: number;
  bonus_amount: number;
  paid_amount: number;
  task_id?: string;
  file_name?: string;
  page_number?: number;
  description?: string;
  created_at: string;
}

// ============ Convert API Types ============

export type CloudModelTier = 'lite' | 'pro' | 'ultra';

export interface CreateTaskResponse {
  task_id: string;
  file_type: 'office' | 'pdf' | 'image';
  file_name: string;
  status: number;
  credits_estimated?: number;
  credits_consumed?: number;
  events_url: string;
}

export interface ConvertApiError {
  code: string;
  message: string;
}

// ============ Task Management Types ============

export enum CloudTaskStatus {
  FAILED = 0,
  PENDING = 1,
  SPLITTING = 2,
  PROCESSING = 3,
  COMPLETED = 6,
  CANCELLED = 7,
  PARTIAL_FAILED = 8,
}

export enum CloudPageStatus {
  PENDING = 0,
  PROCESSING = 1,
  COMPLETED = 2,
  FAILED = 3,
}

export interface CloudTaskResponse {
  id: string;
  file_type: 'office' | 'pdf' | 'image';
  file_name: string;
  status: number;
  status_name: string;
  page_count: number;
  pages_completed: number;
  pages_failed: number;
  pdf_url: string;
  credits_estimated: number;
  credits_consumed: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface CloudTaskPageResponse {
  page: number;
  status: number;
  status_name: string;
  markdown: string;
  width_mm: number;
  height_mm: number;
}

export interface CloudTaskResult {
  markdown: string;
  pages: Array<{ page: number; markdown: string }>;
  metadata: {
    model_tier: string;
    file_type: string;
    page_count: number;
  };
  credits: {
    consumed: number;
  };
}

export interface CloudCancelTaskResponse {
  id: string;
  status: number;
  credits_consumed: number;
  credits_refunded: number;
  message: string;
}

export interface CloudRetryPageResponse {
  task_id: string;
  page: number;
  status: number;
  message: string;
}

export interface CloudApiPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ============ SSE Event Types ============

export type CloudSSEEventType =
  | 'pdf_ready'
  | 'page_started'
  | 'page_completed'
  | 'page_failed'
  | 'page_retry_started'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'heartbeat';

export interface CloudSSEPDFReadyData {
  task_id: string;
  pdf_url: string;
  page_count: number;
  page_dimensions: Array<{ page: number; width: number; height: number }>;
  credits_estimated: number;
}

export interface CloudSSEPageStartedData {
  task_id: string;
  page: number;
  total_pages: number;
}

export interface CloudSSEPageCompletedData {
  task_id: string;
  page: number;
  total_pages: number;
  markdown: string;
  credits_consumed: number;
}

export interface CloudSSEPageFailedData {
  task_id: string;
  page: number;
  total_pages: number;
  error: string;
  retry_count: number;
}

export interface CloudSSETaskCompletedData {
  task_id: string;
  status: number;
  total_pages: number;
  pages_completed: number;
  pages_failed: number;
  credits_consumed: number;
  bonus_remaining: number;
  paid_remaining: number;
}

export interface CloudSSETaskErrorData {
  task_id: string;
  error: string;
  stage: string;
}

export interface CloudSSETaskCancelledData {
  task_id: string;
  cancelled_at: string;
  pages_completed: number;
  credits_refunded: number;
}

export interface CloudSSEHeartbeatData {
  time: string;
}

export type CloudSSEEvent =
  | { type: 'pdf_ready'; data: CloudSSEPDFReadyData }
  | { type: 'page_started'; data: CloudSSEPageStartedData }
  | { type: 'page_completed'; data: CloudSSEPageCompletedData }
  | { type: 'page_failed'; data: CloudSSEPageFailedData }
  | { type: 'page_retry_started'; data: CloudSSEPageStartedData }
  | { type: 'completed'; data: CloudSSETaskCompletedData }
  | { type: 'error'; data: CloudSSETaskErrorData }
  | { type: 'cancelled'; data: CloudSSETaskCancelledData }
  | { type: 'heartbeat'; data: CloudSSEHeartbeatData };
