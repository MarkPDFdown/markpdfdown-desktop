import { ipcMain } from "electron";
import providerRepository from "../../../core/domain/repositories/ProviderRepository.js";
import modelRepository from "../../../core/domain/repositories/ModelRepository.js";
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";

/**
 * Register all model-related IPC handlers
 */
export function registerModelHandlers() {
  /**
   * Get all models (grouped by provider)
   */
  ipcMain.handle(IPC_CHANNELS.MODEL.GET_ALL, async (): Promise<IpcResponse> => {
    try {
      const providers = await providerRepository.findAll();
      const models = await modelRepository.findAll();

      const groupedModels = providers.map((provider: any) => ({
        provider: provider.id,
        providerName: provider.name,
        models: models.filter((model: any) => model.provider === provider.id),
      }));

      return { success: true, data: groupedModels };
    } catch (error: any) {
      console.error("[IPC] model:getAll error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get models by provider
   */
  ipcMain.handle(
    IPC_CHANNELS.MODEL.GET_BY_PROVIDER,
    async (_, providerId: number): Promise<IpcResponse> => {
      try {
        const models = await modelRepository.findByProviderId(providerId);
        return { success: true, data: models };
      } catch (error: any) {
        console.error("[IPC] model:getByProvider error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Create model
   */
  ipcMain.handle(IPC_CHANNELS.MODEL.CREATE, async (_, data: any): Promise<IpcResponse> => {
    try {
      const { id, provider, name } = data;

      if (!id || !provider || !name) {
        return { success: false, error: "Model ID, provider ID, and name are required" };
      }

      const newModel = await modelRepository.create({ id, provider, name });
      return { success: true, data: newModel };
    } catch (error: any) {
      console.error("[IPC] model:create error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete model
   */
  ipcMain.handle(
    IPC_CHANNELS.MODEL.DELETE,
    async (_, id: string, provider: number): Promise<IpcResponse> => {
      try {
        if (!id || !provider) {
          return { success: false, error: "Model ID and provider ID are required" };
        }

        await modelRepository.remove(id, provider);
        return { success: true, data: { message: "Model deleted successfully" } };
      } catch (error: any) {
        console.error("[IPC] model:delete error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  console.log("[IPC] Model handlers registered");
}
