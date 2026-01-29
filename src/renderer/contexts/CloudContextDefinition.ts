import { createContext } from 'react';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  imageUrl: string;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export interface Credits {
  total: number;
  free: number; // Daily free/bonus credits
  paid: number; // Purchased credits
  dailyLimit: number;
  usedToday: number;
}

export interface CreditHistoryItem {
  id: string;
  amount: number;
  type: 'consumption' | 'recharge' | 'bonus' | 'refund';
  description: string;
  createdAt: string;
  taskId?: string;
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
  token: string | null;

  // Actions
  login: () => void;
  logout: () => void;
  refreshCredits: () => Promise<void>;
  getToken: () => Promise<string | null>;
  convertFile: (file: CloudFileInput) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  getTasks: (page?: number, pageSize?: number) => Promise<{ success: boolean; data?: any[]; total?: number; error?: string }>;
  getCreditHistory: (page?: number, pageSize?: number) => Promise<{ success: boolean; data?: CreditHistoryItem[]; total?: number; error?: string }>;
}

export const CloudContext = createContext<CloudContextType | undefined>(undefined);
