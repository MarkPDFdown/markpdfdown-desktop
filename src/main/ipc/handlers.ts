/**
 * IPC Handlers Entry Point
 *
 * This file re-exports the modular handler registration from the handlers/ directory.
 * For the actual handler implementations, see:
 * - handlers/provider.handler.ts
 * - handlers/model.handler.ts
 * - handlers/task.handler.ts
 * - handlers/taskDetail.handler.ts
 * - handlers/file.handler.ts
 * - handlers/completion.handler.ts
 */
import { registerAllHandlers } from './handlers/index.js';

/**
 * Register all IPC handlers
 * @deprecated Use registerAllHandlers from './handlers/index.js' directly
 */
export function registerIpcHandlers() {
  registerAllHandlers();
}

// Re-export for direct access
export { registerAllHandlers } from './handlers/index.js';
