import { authManager } from './AuthManager.js';
import { API_BASE_URL } from '../config.js';
import type { CreditsApiResponse, CreditTransactionApiItem } from '../../../shared/types/cloud-api.js';

/**
 * CloudService handles interaction with the MarkPDFDown Cloud API
 */
class CloudService {
  private static instance: CloudService;

  private constructor() {}

  public static getInstance(): CloudService {
    if (!CloudService.instance) {
      CloudService.instance = new CloudService();
    }
    return CloudService.instance;
  }

  /**
   * Convert a file using the cloud API
   */
  public async convert(fileData: { path?: string; content?: ArrayBuffer; name: string; model?: string }): Promise<any> {
    const token = await authManager.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const model = fileData.model || 'lite';
    console.log('[CloudService] Starting cloud conversion for:', fileData.name, 'model:', model);

    // Simulating API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // For now, return a mock response
    return {
      success: true,
      taskId: 'cloud-' + Date.now(),
      status: 'processing',
      message: 'File uploaded successfully'
    };
  }

  /**
   * Get tasks from the cloud API
   */
  public async getTasks(page: number = 1, pageSize: number = 10): Promise<any> {
    const token = await authManager.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    console.log(`[CloudService] Fetching tasks page ${page}`);

    // Simulating API call delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock response
    return {
      success: true,
      data: [
        {
          id: 'cloud-task-1',
          name: 'Sample Document.pdf',
          status: 'completed',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          credits: 5
        },
        {
          id: 'cloud-task-2',
          name: 'Report 2024.pdf',
          status: 'processing',
          createdAt: new Date().toISOString(),
          credits: 3
        }
      ],
      total: 2,
      page,
      pageSize
    };
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
}

export default CloudService.getInstance();
