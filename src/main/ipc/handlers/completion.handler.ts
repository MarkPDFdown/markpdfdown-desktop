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
      url: string,
    ): Promise<IpcResponse> => {
      try {
        if (!providerId || !modelId || !url) {
          return {
            success: false,
            error: "providerId, modelId, and url are required",
          };
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
    },
  );

  /**
   * Test model connection
   */
  ipcMain.handle(
    IPC_CHANNELS.COMPLETION.TEST_CONNECTION,
    async (_, providerId: number, modelId: string): Promise<IpcResponse> => {
      try {
        if (!providerId || !modelId) {
          return {
            success: false,
            error: "providerId and modelId are required",
          };
        }

        // Use a simple base64 image for testing
        const testImageBase64 =
          "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";

        const result = await modelLogic.completion(providerId, {
          model: modelId,
          maxTokens: 8,
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
                  text: "Please identify the largest letter in the image.",
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
    },
  );

  console.log("[IPC] Completion handlers registered");
}
