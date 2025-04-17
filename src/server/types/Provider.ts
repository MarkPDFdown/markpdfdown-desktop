// Provider类型定义
export interface ProviderData {
  name: string;
  type: string;
  api_key: string;
  base_url: string;
  suffix: string;
  status: number;
}

// 用于部分更新的Provider类型
export interface PartialProviderData {
  name?: string;
  type?: string;
  api_key?: string;
  base_url?: string;
  suffix?: string;
  status?: number;
} 