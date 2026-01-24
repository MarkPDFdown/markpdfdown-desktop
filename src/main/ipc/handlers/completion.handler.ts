import { ipcMain } from "electron";
import modelLogic from "../../../core/application/services/ModelService.js";
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";

/**
 * Register all completion (LLM) related IPC handlers
 */
export function registerCompletionHandlers() {
  /**
   * Convert image to Markdown
   */
  ipcMain.handle(
    IPC_CHANNELS.COMPLETION.MARK_IMAGEDOWN,
    async (
      _,
      providerId: number,
      modelId: string,
      url: string
    ): Promise<IpcResponse> => {
      try {
        if (!providerId || !modelId || !url) {
          return { success: false, error: "providerId, modelId, and url are required" };
        }

        const result = await modelLogic.completion(providerId, {
          model: modelId,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url },
                },
                {
                  type: "text",
                  text: "Convert this image to markdown.",
                },
              ],
            },
          ],
        });

        return { success: true, data: result };
      } catch (error: any) {
        console.error("[IPC] completion:markImagedown error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Test model connection
   */
  ipcMain.handle(
    IPC_CHANNELS.COMPLETION.TEST_CONNECTION,
    async (_, providerId: number, modelId: string): Promise<IpcResponse> => {
      try {
        if (!providerId || !modelId) {
          return { success: false, error: "providerId and modelId are required" };
        }

        // Use a simple base64 image for testing
        const testImageBase64 =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

        const result = await modelLogic.completion(providerId, {
          model: modelId,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${testImageBase64}`,
                  },
                },
                {
                  type: "text",
                  text: "Test connection.",
                },
              ],
            },
          ],
        });

        return { success: true, data: result };
      } catch (error: any) {
        console.error("[IPC] completion:testConnection error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  console.log("[IPC] Completion handlers registered");
}
