# IPC API Reference

All communication between the renderer process and main process is done via `window.api.*`, returning `Promise<IpcResponse>`.

## Response Format

All API calls return a unified response format:

```typescript
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## Providers

Manage LLM service providers (OpenAI, Anthropic, etc.).

| Method | Description |
|--------|-------------|
| `window.api.provider.getAll()` | Get all providers |
| `window.api.provider.getById(id)` | Get provider by ID |
| `window.api.provider.create(data)` | Create a new provider |
| `window.api.provider.update(id, data)` | Update an existing provider |
| `window.api.provider.delete(id)` | Delete a provider |
| `window.api.provider.updateStatus(id, status)` | Update provider status |

---

## Models

Manage LLM models associated with providers.

| Method | Description |
|--------|-------------|
| `window.api.model.getAll()` | Get all models (grouped by provider) |
| `window.api.model.getByProvider(providerId)` | Get models by provider ID |
| `window.api.model.create(data)` | Create a new model |
| `window.api.model.delete(id, provider)` | Delete a model |

---

## Tasks

Manage PDF/image conversion tasks.

| Method | Description |
|--------|-------------|
| `window.api.task.create(tasks[])` | Create tasks (batch) |
| `window.api.task.getAll({page, pageSize})` | Get tasks (paginated) |
| `window.api.task.getById(id)` | Get task by ID |
| `window.api.task.update(id, data)` | Update a task |
| `window.api.task.delete(id)` | Delete a task |
| `window.api.task.hasRunningTasks()` | Check if there are running tasks |

---

## Task Details

Manage individual page conversion details within a task.

| Method | Description |
|--------|-------------|
| `window.api.taskDetail.getByPage(taskId, page)` | Get task detail with image for a page |
| `window.api.taskDetail.getAllByTask(taskId)` | Get all task details for a task |
| `window.api.taskDetail.retry(pageId)` | Retry a single failed page |
| `window.api.taskDetail.retryFailed(taskId)` | Retry all failed pages in a task |

---

## Files

Handle file operations (upload, download, dialog).

| Method | Description |
|--------|-------------|
| `window.api.file.selectDialog()` | Open file selection dialog |
| `window.api.file.upload(taskId, filePath)` | Upload file |
| `window.api.file.uploadMultiple(taskId, filePaths[])` | Upload multiple files |
| `window.api.file.uploadFileContent(taskId, fileName, fileBuffer)` | Upload file content as ArrayBuffer |
| `window.api.file.getImagePath(taskId, page)` | Get image path for a page |
| `window.api.file.downloadMarkdown(taskId)` | Download merged markdown file |

---

## Completion

LLM completion and testing operations.

| Method | Description |
|--------|-------------|
| `window.api.completion.markImagedown(providerId, modelId, url)` | Convert image to markdown |
| `window.api.completion.testConnection(providerId, modelId)` | Test model connection |

---

## Shell

System shell operations.

| Method | Description |
|--------|-------------|
| `window.api.shell.openExternal(url)` | Open URL in default browser |

---

## Window

Window control operations.

| Method | Description |
|--------|-------------|
| `window.api.window.minimize()` | Minimize the window |
| `window.api.window.maximize()` | Maximize/restore the window |
| `window.api.window.close()` | Close the window |

---

## Events

Subscribe to real-time events from the main process.

| Method | Description |
|--------|-------------|
| `window.api.events.onTaskEvent(callback)` | Subscribe to task events (returns unsubscribe function) |
| `window.api.events.onTaskDetailEvent(callback)` | Subscribe to task detail events (returns unsubscribe function) |

### Usage Example

```typescript
// Subscribe to task events
const unsubscribe = window.api.events.onTaskEvent((event) => {
  console.log('Task event:', event);
});

// Unsubscribe when done
unsubscribe();
```

---

## App

Application information.

| Method | Description |
|--------|-------------|
| `window.api.app.getVersion()` | Get app version from package.json |

---

## Platform

Platform information (synchronous property).

| Property | Description |
|----------|-------------|
| `window.api.platform` | Get current platform (`'win32'`, `'darwin'`, `'linux'`) |
