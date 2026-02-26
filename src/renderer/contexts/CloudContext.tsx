import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import { CloudContext, UserProfile, Credits, CreditHistoryItem, CloudFileInput } from './CloudContextDefinition';
import type { AuthState, DeviceFlowStatus } from '../../shared/types/cloud-api';

interface CloudProviderProps {
  children: ReactNode;
}

const defaultUser: UserProfile = {
  id: 0,
  email: '',
  name: null,
  avatarUrl: null,
  isLoaded: false,
  isSignedIn: false,
};

const defaultCredits: Credits = {
  total: 0,
  free: 0,
  paid: 0,
  dailyLimit: 200,
  usedToday: 0,
  bonusBalance: 0,
  dailyResetAt: '',
  monthlyResetAt: '',
};

export const CloudProvider: React.FC<CloudProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(defaultUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceFlowStatus, setDeviceFlowStatus] = useState<DeviceFlowStatus>('idle');
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [credits, setCredits] = useState<Credits>({ ...defaultCredits });

  // Apply auth state from main process
  const applyAuthState = useCallback((state: AuthState) => {
    setIsAuthenticated(state.isAuthenticated);
    setIsLoading(state.isLoading);
    setDeviceFlowStatus(state.deviceFlowStatus);
    setUserCode(state.userCode);
    setVerificationUrl(state.verificationUrl);
    setAuthError(state.error);

    if (state.user) {
      setUser({
        id: state.user.id,
        email: state.user.email,
        name: state.user.name,
        avatarUrl: state.user.avatar_url,
        isLoaded: true,
        isSignedIn: true,
      });
    } else {
      setUser({ ...defaultUser, isLoaded: !state.isLoading });
    }
  }, []);

  // Fetch initial auth state and listen for changes
  useEffect(() => {
    // Get initial state
    window.api?.auth?.getAuthState().then((result) => {
      if (result.success && result.data) {
        applyAuthState(result.data);
      } else {
        setIsLoading(false);
        setUser({ ...defaultUser, isLoaded: true });
      }
    }).catch(() => {
      setIsLoading(false);
      setUser({ ...defaultUser, isLoaded: true });
    });

    // Listen for state changes
    if (!window.api?.events?.onAuthStateChanged) return;

    const cleanup = window.api.events.onAuthStateChanged((state: AuthState) => {
      applyAuthState(state);
    });

    return cleanup;
  }, [applyAuthState]);

  // Login action - trigger device flow via IPC
  const login = useCallback(() => {
    window.api?.auth?.login().catch((err: Error) => {
      console.error('Login failed:', err);
    });
  }, []);

  // Cancel login
  const cancelLogin = useCallback(() => {
    window.api?.auth?.cancelLogin().catch((err: Error) => {
      console.error('Cancel login failed:', err);
    });
  }, []);

  // Logout action
  const logout = useCallback(() => {
    window.api?.auth?.logout().then(() => {
      setCredits({ ...defaultCredits });
    }).catch((err: Error) => {
      console.error('Logout failed:', err);
    });
  }, []);

  // Refresh credits from cloud API
  const refreshCredits = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      if (window.api?.cloud?.getCredits) {
        const result = await window.api.cloud.getCredits();
        if (result.success && result.data) {
          const d = result.data;
          setCredits({
            total: d.total_available,
            free: d.bonus.daily_remaining,
            paid: d.paid.balance,
            dailyLimit: d.bonus.daily_limit,
            usedToday: d.bonus.daily_used,
            bonusBalance: d.bonus.balance,
            dailyResetAt: d.bonus.daily_reset_at,
            monthlyResetAt: d.bonus.monthly_reset_at,
          });
        }
      }
    } catch (error) {
      console.error('Failed to refresh credits:', error);
    }
  }, [isAuthenticated]);

  // Cloud conversion function
  const convertFile = useCallback(async (file: CloudFileInput) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      const fileData: { path?: string; content?: ArrayBuffer; name: string } = {
        name: file.name
      };

      if (file.url) {
        fileData.path = file.url;
      } else if (file.originFileObj) {
        fileData.content = await file.originFileObj.arrayBuffer();
      } else {
        return { success: false, error: 'Invalid file data' };
      }

      if (window.api?.cloud) {
        const result = await window.api.cloud.convert(fileData);
        return result;
      } else {
        return { success: false, error: 'Cloud API not available' };
      }
    } catch (error) {
      console.error('Cloud conversion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [isAuthenticated]);

  // Fetch cloud tasks
  const getTasks = useCallback(async (page: number = 1, pageSize: number = 10) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (window.api?.cloud) {
        return await window.api.cloud.getTasks({ page, pageSize });
      } else {
        return { success: false, error: 'Cloud API not available' };
      }
    } catch (error) {
      console.error('Failed to fetch cloud tasks:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [isAuthenticated]);

  // Fetch credit history
  const getCreditHistory = useCallback(async (page: number = 1, pageSize: number = 10, type?: string) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (window.api?.cloud) {
        const result = await window.api.cloud.getCreditHistory({ page, pageSize, type });
        if (result.success) {
          // Transform API response (snake_case) to renderer types (camelCase)
          const transformedData: CreditHistoryItem[] = (result.data || []).map((item: any) => ({
            id: item.id,
            amount: item.amount,
            type: item.type,
            typeName: item.type_name,
            description: item.file_name || item.description || '',
            createdAt: item.created_at,
            taskId: item.task_id,
            balanceAfter: item.balance_after,
            bonusAmount: item.bonus_amount,
            paidAmount: item.paid_amount,
            fileName: item.file_name,
          }));

          const pagination = result.pagination ? {
            page: result.pagination.page,
            pageSize: result.pagination.page_size,
            total: result.pagination.total,
            totalPages: result.pagination.total_pages,
          } : undefined;

          return { success: true, data: transformedData, pagination };
        }
        return { success: false, error: result.error };
      } else {
        return { success: false, error: 'Cloud API not available' };
      }
    } catch (error) {
      console.error('Failed to fetch credit history:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [isAuthenticated]);

  // Refresh credits when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refreshCredits();
    }
  }, [isAuthenticated, refreshCredits]);

  return (
    <CloudContext.Provider
      value={{
        user,
        credits,
        isAuthenticated,
        isLoading,
        deviceFlowStatus,
        userCode,
        verificationUrl,
        authError,
        login,
        logout,
        cancelLogin,
        refreshCredits,
        convertFile,
        getTasks,
        getCreditHistory
      }}
    >
      {children}
    </CloudContext.Provider>
  );
};
