import { registerProviderHandlers } from './provider.handler.js';
import { registerModelHandlers } from './model.handler.js';
import { registerTaskHandlers } from './task.handler.js';
import { registerTaskDetailHandlers } from './taskDetail.handler.js';
import { registerFileHandlers } from './file.handler.js';
import { registerCompletionHandlers } from './completion.handler.js';
import { registerAppHandlers } from './app.handler.js';
import { registerCloudHandlers } from './cloud.handler.js';
import { registerUpdaterHandlers } from './updater.handler.js';

/**
 * Register all IPC handlers
 *
 * This function registers handlers for all domains:
 * - Provider: LLM provider management
 * - Model: LLM model management
 * - Task: Task management (create, update, delete, list)
 * - TaskDetail: Page-level operations and retry
 * - File: File operations (upload, download, select)
 * - Completion: LLM API calls
 * - Cloud: Cloud API operations
 * - App: Application info (version)
 * - Updater: Auto-update management
 */
export function registerAllHandlers() {
  registerProviderHandlers();
  registerModelHandlers();
  registerTaskHandlers();
  registerTaskDetailHandlers();
  registerFileHandlers();
  registerCompletionHandlers();
  registerCloudHandlers();
  registerAppHandlers();
  registerUpdaterHandlers();

  console.log("[IPC] All handlers registered successfully");
}

// Re-export individual handler registrations for testing or selective use
export {
  registerProviderHandlers,
  registerModelHandlers,
  registerTaskHandlers,
  registerTaskDetailHandlers,
  registerFileHandlers,
  registerCompletionHandlers,
  registerCloudHandlers,
  registerAppHandlers,
  registerUpdaterHandlers,
};
