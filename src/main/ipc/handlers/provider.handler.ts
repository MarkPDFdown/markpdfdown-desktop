import { ipcMain } from "electron";
import providerRepository from "../../../core/domain/repositories/ProviderRepository.js";
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";
import {
  providerPresets,
  findProviderPreset,
} from "../../../core/infrastructure/config/providerPresets.js";

/**
 * Register all provider-related IPC handlers
 */
export function registerProviderHandlers() {
  /**
   * Get all providers (including disabled)
   */
  ipcMain.handle(IPC_CHANNELS.PROVIDER.GET_ALL, async (): Promise<IpcResponse> => {
    try {
      const providers = await providerRepository.findAllIncludeDisabled();
      return { success: true, data: providers };
    } catch (error: any) {
      console.error("[IPC] provider:getAll error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get provider by ID
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.GET_BY_ID,
    async (_, id: number): Promise<IpcResponse> => {
      try {
        const provider = await providerRepository.findById(id);

        if (!provider) {
          return { success: false, error: "Provider not found" };
        }

        return { success: true, data: provider };
      } catch (error: any) {
        console.error("[IPC] provider:getById error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Create provider
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.CREATE,
    async (_, data: any): Promise<IpcResponse> => {
      try {
        const { name, type } = data;

        if (!name || !type) {
          return { success: false, error: "Name and type are required" };
        }

        const newProvider = await providerRepository.create({
          name,
          type,
          api_key: "",
          base_url: "",
          suffix: "",
          status: 0,
        });

        return { success: true, data: newProvider };
      } catch (error: any) {
        console.error("[IPC] provider:create error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Update provider
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.UPDATE,
    async (_, id: number, data: any): Promise<IpcResponse> => {
      try {
        const existingProvider = await providerRepository.findById(id);
        if (!existingProvider) {
          return { success: false, error: "Provider not found" };
        }

        const updateData: any = {};
        if (data.api_key !== undefined) updateData.api_key = data.api_key;
        if (data.base_url !== undefined) updateData.base_url = data.base_url;
        if (data.suffix !== undefined) updateData.suffix = data.suffix;

        const updatedProvider = await providerRepository.update(id, updateData);
        return { success: true, data: updatedProvider };
      } catch (error: any) {
        console.error("[IPC] provider:update error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Delete provider
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.DELETE,
    async (_, id: number): Promise<IpcResponse> => {
      try {
        const existingProvider = await providerRepository.findById(id);
        if (!existingProvider) {
          return { success: false, error: "Provider not found" };
        }

        await providerRepository.remove(id);
        return { success: true };
      } catch (error: any) {
        console.error("[IPC] provider:delete error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Update provider status
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.UPDATE_STATUS,
    async (_, id: number, status: number): Promise<IpcResponse> => {
      try {
        if (status === undefined) {
          return { success: false, error: "Invalid status value" };
        }

        const existingProvider = await providerRepository.findById(id);
        if (!existingProvider) {
          return { success: false, error: "Provider not found" };
        }

        const updatedProvider = await providerRepository.updateStatus(id, status);
        return { success: true, data: updatedProvider };
      } catch (error: any) {
        console.error("[IPC] provider:updateStatus error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Get all provider presets
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.GET_PRESETS,
    async (): Promise<IpcResponse> => {
      try {
        return { success: true, data: providerPresets };
      } catch (error: any) {
        console.error("[IPC] provider:getPresets error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Fetch model list from provider's modelListApi
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER.FETCH_MODEL_LIST,
    async (_, providerId: number): Promise<IpcResponse> => {
      try {
        const provider = await providerRepository.findById(providerId);
        if (!provider) {
          return { success: false, error: "Provider not found" };
        }

        // Find preset configuration for this provider
        const preset = findProviderPreset(provider.type, provider.name);
        if (!preset) {
          return {
            success: false,
            error: "No preset configuration found for this provider",
          };
        }

        // Construct the full URL for fetching models
        const baseUrl = provider.base_url || preset.apiBase;
        const modelListUrl = `${baseUrl}${preset.modelListApi}`;

        // Prepare headers based on provider type
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (provider.api_key) {
          switch (provider.type) {
            case "anthropic":
              headers["x-api-key"] = provider.api_key;
              headers["anthropic-version"] = "2023-06-01";
              break;
            case "gemini":
              headers["x-goog-api-key"] = provider.api_key;
              break;
            default:
              headers["Authorization"] = `Bearer ${provider.api_key}`;
              break;
          }
        }

        const url = modelListUrl;

        // Fetch models from the provider
        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[IPC] provider:fetchModelList HTTP error: ${response.status}`,
            errorText
          );
          return {
            success: false,
            error: `Failed to fetch models: HTTP ${response.status}`,
          };
        }

        const data = await response.json();

        // Filter models by capability field configured in preset
        const filterByCapability = (items: any[]): any[] => {
          if (!preset.capabilityField || !preset.capabilityFilter) return items;
          return items.filter((item) => {
            const value = getNestedValue(item, preset.capabilityField!);
            if (!Array.isArray(value)) return true;
            return value.includes(preset.capabilityFilter);
          });
        };

        // Parse the response based on provider type
        let models: Array<{ id: string; name: string }> = [];

        switch (provider.type) {
          case "openai":
          case "openai-responses":
            // OpenAI format: { data: [{ id: string, ... }] }
            if (data.data && Array.isArray(data.data)) {
              models = filterByCapability(data.data).map((item: any) => ({
                id: item[preset.modelIdField] || item.id,
                name: item[preset.modelNameField] || item.id,
              }));
            }
            break;

          case "anthropic":
            // Anthropic format: { data: [{ id: string, display_name: string, ... }] }
            if (data.data && Array.isArray(data.data)) {
              models = filterByCapability(data.data).map((item: any) => ({
                id: item[preset.modelIdField] || item.id,
                name: item[preset.modelNameField] || item.id,
              }));
            }
            break;

          case "gemini":
            // Gemini format: { models: [{ name: string, displayName: string, ... }] }
            if (data.models && Array.isArray(data.models)) {
              models = filterByCapability(data.models).map((item: any) => ({
                id: item[preset.modelIdField]?.replace("models/", "") || item.name,
                name: item[preset.modelNameField] || item.name,
              }));
            }
            break;

          case "ollama":
            // Ollama format: { models: [{ name: string, ... }] }
            if (data.models && Array.isArray(data.models)) {
              models = filterByCapability(data.models).map((item: any) => ({
                id: item[preset.modelIdField] || item.name,
                name: item[preset.modelNameField] || item.name,
              }));
            }
            break;

          default:
            // Try to extract models from common formats
            const modelArray = data.data || data.models || [];
            if (Array.isArray(modelArray)) {
              models = filterByCapability(modelArray).map((item: any) => ({
                id: getNestedValue(item, preset.modelIdField) || item.id || item.name,
                name: getNestedValue(item, preset.modelNameField) || item.id || item.name,
              }));
            }
        }

        return { success: true, data: models };
      } catch (error: any) {
        console.error("[IPC] provider:fetchModelList error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  console.log("[IPC] Provider handlers registered");
}

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}
