import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import {
  CloudContext,
  UserProfile,
  Credits,
  CreditHistoryItem,
  PaymentHistoryItem,
  CloudFileInput,
  CheckoutStatus,
} from './CloudContextDefinition';
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
  const convertFile = useCallback(async (file: CloudFileInput, model?: string, pageRange?: string) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      const fileData: { path?: string; content?: ArrayBuffer; name: string; model?: string; page_range?: string } = {
        name: file.name,
        model: model || 'lite',
        page_range: pageRange || undefined,
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

  const getTaskById = useCallback(async (id: string) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.getTaskById(id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const getTaskPages = useCallback(async (taskId: string, page?: number, pageSize?: number) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.getTaskPages({ taskId, page, pageSize });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const cancelTask = useCallback(async (id: string) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      const result = await window.api.cloud.cancelTask(id);
      if (result.success) refreshCredits();
      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated, refreshCredits]);

  const retryTask = useCallback(async (id: string) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.retryTask(id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const deleteTask = useCallback(async (id: string) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.deleteTask(id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const retryPage = useCallback(async (taskId: string, pageNumber: number) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.retryPage({ taskId, pageNumber });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const getTaskResult = useCallback(async (id: string) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.getTaskResult(id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const downloadResult = useCallback(async (id: string) => {
    if (!isAuthenticated) return { success: false, error: 'User not signed in' };
    try {
      return await window.api.cloud.downloadPdf(id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [isAuthenticated]);

  const createCheckout = useCallback(async (amountUsd: number) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (!window.api?.cloud?.createCheckout) {
        return { success: false, error: 'Cloud API not available' };
      }

      const result = await window.api.cloud.createCheckout({ amountUsd });
      if (result.success && result.data) {
        return {
          success: true,
          data: {
            checkoutUrl: result.data.checkout_url,
            sessionId: result.data.session_id,
            amountUsd: result.data.amount_usd,
            creditsToAdd: result.data.credits_to_add,
          },
        };
      }

      return { success: false, error: result.error || 'Failed to create checkout session' };
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isAuthenticated]);

  const mapCheckoutStatus = useCallback((data: any): CheckoutStatus => ({
    sessionId: data.session_id,
    orderId: data.order_id,
    status: data.status,
    providerStatus: data.provider_status,
    isFinal: data.is_final,
    changed: data.changed,
    amountUsd: data.amount_usd,
    creditsAdded: data.credits_added,
    createdAt: data.created_at,
  }), []);

  const getCheckoutStatus = useCallback(async (sessionId: string, waitSeconds: number = 10) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (!window.api?.cloud?.getCheckoutStatus) {
        return { success: false, error: 'Cloud API not available' };
      }

      const result = await window.api.cloud.getCheckoutStatus({ sessionId, waitSeconds });
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Failed to get checkout status' };
      }

      return {
        success: true,
        data: mapCheckoutStatus(result.data),
      };
    } catch (error) {
      console.error('Failed to get checkout status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isAuthenticated, mapCheckoutStatus]);

  const reconcileCheckout = useCallback(async (sessionId: string) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (!window.api?.cloud?.reconcileCheckout) {
        return { success: false, error: 'Cloud API not available' };
      }

      const result = await window.api.cloud.reconcileCheckout({ sessionId });
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Failed to reconcile checkout' };
      }

      return {
        success: true,
        data: mapCheckoutStatus(result.data),
      };
    } catch (error) {
      console.error('Failed to reconcile checkout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isAuthenticated, mapCheckoutStatus]);

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
            description: item.description || '',
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

  const getPaymentHistory = useCallback(async (page: number = 1, pageSize: number = 10) => {
    if (!isAuthenticated) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (window.api?.cloud) {
        const result = await window.api.cloud.getPaymentHistory({ page, pageSize });
        if (result.success) {
          const transformedData: PaymentHistoryItem[] = (result.data || []).map((item: any) => ({
            id: item.id,
            amountUsd: item.amount_usd,
            creditsAdded: item.credits_added,
            status: item.status,
            providerStatus: item.provider_status,
            createdAt: item.created_at,
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
      console.error('Failed to fetch payment history:', error);
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

  // SSE lifecycle: connect when authenticated, full reset when logged out
  useEffect(() => {
    if (isAuthenticated) {
      window.api?.cloud?.sseConnect?.();
    } else {
      // User logged out: full reset clears lastEventId so next login starts fresh
      window.api?.cloud?.sseResetAndDisconnect?.();
    }
    return () => {
      // Component unmount: preserve lastEventId for seamless resumption
      window.api?.cloud?.sseDisconnect?.();
    };
  }, [isAuthenticated]);

  // Payment callback lifecycle: refresh credits when checkout flow returns
  useEffect(() => {
    if (!window.api?.events?.onPaymentCallback) return;

    const cleanup = window.api.events.onPaymentCallback((event) => {
      console.log('[CloudContext] Payment callback received:', event);
      if (isAuthenticated) {
        refreshCredits();
      }
    });

    return cleanup;
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
        getTaskById,
        getTaskPages,
        cancelTask,
        retryTask,
        deleteTask,
        retryPage,
        getTaskResult,
        downloadResult,
        createCheckout,
        getCheckoutStatus,
        reconcileCheckout,
        getCreditHistory,
        getPaymentHistory
      }}
    >
      {children}
    </CloudContext.Provider>
  );
};
