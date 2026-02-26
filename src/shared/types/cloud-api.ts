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
