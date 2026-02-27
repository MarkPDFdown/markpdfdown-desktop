import { createContext } from 'react';
import type { DeviceFlowStatus, CloudTaskResponse, CloudTaskPageResponse, CloudApiPagination, CloudTaskResult } from '../../shared/types/cloud-api';

export interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export interface Credits {
  total: number;          // API total_available
  free: number;           // API bonus.daily_remaining
  paid: number;           // API paid.balance
  dailyLimit: number;     // API bonus.daily_limit
  usedToday: number;      // API bonus.daily_used
  bonusBalance: number;   // API bonus.balance (月度总余额)
  dailyResetAt: string;   // API bonus.daily_reset_at
  monthlyResetAt: string; // API bonus.monthly_reset_at
}

export type CreditTransactionType =
  | 'topup'
  | 'consume'
  | 'consume_settle'
  | 'refund'
  | 'bonus_grant'
  | 'bonus_expire'
  | 'page_retry';

export interface CreditHistoryItem {
  id: number;
  amount: number;
  type: CreditTransactionType;
  typeName: string;
  description: string;
  createdAt: string;
  taskId?: string;
  balanceAfter?: number;
  bonusAmount?: number;
  paidAmount?: number;
  fileName?: string;
}

// File input type for cloud conversion (supports both UploadFile and File)
export interface CloudFileInput {
  name: string;
  url?: string;  // File path from dialog selection
  originFileObj?: File;  // File object from drag and drop
}

export interface CloudContextType {
  user: UserProfile;
  credits: Credits;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Device flow state
  deviceFlowStatus: DeviceFlowStatus;
  userCode: string | null;
  verificationUrl: string | null;
  authError: string | null;

  // Actions
  login: () => void;
  logout: () => void;
  cancelLogin: () => void;
  refreshCredits: () => Promise<void>;
  convertFile: (file: CloudFileInput, model?: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  getTasks: (page?: number, pageSize?: number) => Promise<{
    success: boolean;
    data?: CloudTaskResponse[];
    pagination?: CloudApiPagination;
    error?: string;
  }>;
  getTaskById: (id: string) => Promise<{ success: boolean; data?: CloudTaskResponse; error?: string }>;
  getTaskPages: (taskId: string, page?: number, pageSize?: number) => Promise<{
    success: boolean;
    data?: CloudTaskPageResponse[];
    pagination?: CloudApiPagination;
    error?: string;
  }>;
  cancelTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  retryTask: (id: string) => Promise<{ success: boolean; data?: { task_id: string }; error?: string }>;
  deleteTask: (id: string) => Promise<{ success: boolean; data?: { id: string; message: string }; error?: string }>;
  retryPage: (taskId: string, pageNumber: number) => Promise<{ success: boolean; error?: string }>;
  getTaskResult: (id: string) => Promise<{ success: boolean; data?: CloudTaskResult; error?: string }>;
  downloadResult: (id: string) => Promise<{ success: boolean; error?: string }>;
  getCreditHistory: (page?: number, pageSize?: number, type?: string) => Promise<{
    success: boolean;
    data?: CreditHistoryItem[];
    pagination?: { page: number; pageSize: number; total: number; totalPages: number };
    error?: string;
  }>;
}

export const CloudContext = createContext<CloudContextType | undefined>(undefined);
