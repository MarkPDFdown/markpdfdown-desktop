import { ipcMain } from "electron";
import providerRepository from "../../../core/domain/repositories/ProviderRepository.js";
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";

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

  console.log("[IPC] Provider handlers registered");
}
