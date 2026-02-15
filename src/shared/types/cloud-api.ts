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
