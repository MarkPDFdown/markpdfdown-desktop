import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import { CloudContext, UserProfile, Credits, CloudFileInput } from './CloudContextDefinition';

interface CloudProviderProps {
  children: ReactNode;
}

export const CloudProvider: React.FC<CloudProviderProps> = ({ children }) => {
  const { user: clerkUser, isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { getToken, signOut } = useAuth();

  const [showSignIn, setShowSignIn] = useState(false);
  const [credits, setCredits] = useState<Credits>({
    total: 0,
    free: 0,
    paid: 0,
    dailyLimit: 20, // Default limit
    usedToday: 0
  });

  // Transform Clerk user to our domain UserProfile
  const userProfile: UserProfile = {
    id: clerkUser?.id || '',
    email: clerkUser?.primaryEmailAddress?.emailAddress || '',
    fullName: clerkUser?.fullName || '',
    imageUrl: clerkUser?.imageUrl || '',
    isLoaded: isUserLoaded,
    isSignedIn: !!isSignedIn
  };

  // Login action - shows inline SignIn component
  const login = useCallback(() => {
    setShowSignIn(true);
  }, []);

  // Close SignIn modal
  const closeSignIn = useCallback(() => {
    setShowSignIn(false);
  }, []);

  // Logout action
  const logout = useCallback(() => {
    signOut();
  }, [signOut]);

  // Get current auth token
  const getAuthToken = useCallback(async () => {
    try {
      return await getToken();
    } catch (error) {
      console.error('Failed to get token:', error);
      return null;
    }
  }, [getToken]);

  // Refresh credits from backend (mock for now)
  const refreshCredits = useCallback(async () => {
    if (!isSignedIn) return;

    // TODO: Replace with actual API call
    console.log('Fetching credits for user:', clerkUser?.id);

    // Sync token to main process
    try {
      const token = await getToken();
      if (window.api && window.api.cloud) {
        await window.api.cloud.setToken(token);
      }
    } catch (e) {
      console.error('Failed to sync token:', e);
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock data update
    setCredits(prev => ({
      ...prev,
      total: 15,
      free: 5,
      paid: 10
    }));
  }, [isSignedIn, clerkUser?.id, getToken]);

  // Cloud conversion function
  const convertFile = useCallback(async (file: CloudFileInput) => {
    if (!isSignedIn) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      const fileData: { path?: string; content?: ArrayBuffer; name: string } = {
        name: file.name
      };

      if (file.url) {
        // File selected via dialog (has path)
        fileData.path = file.url;
      } else if (file.originFileObj) {
        // File dropped (read content)
        fileData.content = await file.originFileObj.arrayBuffer();
      } else {
        return { success: false, error: 'Invalid file data' };
      }

      // Call IPC
      if (window.api && window.api.cloud) {
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
  }, [isSignedIn]);

  // Fetch cloud tasks
  const getTasks = useCallback(async (page: number = 1, pageSize: number = 10) => {
    if (!isSignedIn) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (window.api && window.api.cloud) {
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
  }, [isSignedIn]);

  // Fetch credit history
  const getCreditHistory = useCallback(async (page: number = 1, pageSize: number = 10) => {
    if (!isSignedIn) {
      return { success: false, error: 'User not signed in' };
    }

    try {
      if (window.api && window.api.cloud) {
        return await window.api.cloud.getCreditHistory({ page, pageSize });
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
  }, [isSignedIn]);

  // Initial data fetch when user signs in
  useEffect(() => {
    if (isSignedIn) {
      refreshCredits();
    } else {
      // Clear token in main process on logout
      if (window.api && window.api.cloud) {
        window.api.cloud.setToken(null).catch(console.error);
      }

      // Reset state on logout
      setCredits({
        total: 0,
        free: 0,
        paid: 0,
        dailyLimit: 20,
        usedToday: 0
      });
    }
  }, [isSignedIn, refreshCredits]);

  // Auto close SignIn modal when user signs in
  useEffect(() => {
    if (isSignedIn && showSignIn) {
      setShowSignIn(false);
    }
  }, [isSignedIn, showSignIn]);

  // Listen for OAuth callback from main process (when user completes OAuth in browser)
  useEffect(() => {
    if (!window.api?.events?.onOAuthCallback) return;

    const cleanup = window.api.events.onOAuthCallback((url) => {
      console.log('[CloudContext] OAuth callback received:', url);
      // Clerk will automatically detect the session change
      // We just need to close the SignIn modal if it's open
      setShowSignIn(false);
    });

    return cleanup;
  }, []);

  return (
    <CloudContext.Provider
      value={{
        user: userProfile,
        credits,
        isAuthenticated: !!isSignedIn,
        isLoading: !isUserLoaded,
        token: null, // Token is retrieved async via getToken()
        showSignIn,
        login,
        logout,
        closeSignIn,
        refreshCredits,
        getToken: getAuthToken,
        convertFile,
        getTasks,
        getCreditHistory
      }}
    >
      {children}
    </CloudContext.Provider>
  );
};
