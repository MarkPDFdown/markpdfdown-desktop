# AGENTS.md - MarkPDFdown Desktop Development Guide

## Build Commands

```bash
# Development
npm run dev                    # Run full dev environment (generates Prisma, starts Electron with IPC)

# Production Build
npm run build                  # Full production build (generates Prisma + builds Electron app)
npm run start                  # Preview production build (generates Prisma + previews Electron)

# Platform-specific builds (must run npm run build first)
npm run build:win              # Build Windows NSIS installer (x64 + arm64)
npm run build:mac              # Build macOS DMG (x64 + arm64)
npm run build:linux            # Build Linux AppImage (x64 + arm64)

# Database
npm run generate               # Generate Prisma client (required after schema changes)
npm run migrate:dev            # Run migrations in development (creates/updates database)
npm run migrate:reset          # Reset database and re-run all migrations (WARNING: deletes all data)

# Other
npm run lint                   # Run ESLint with auto-fix on all .js/.jsx/.ts/.tsx files
npm run logo                   # Generate app icons from src/renderer/assets/logo.png to public/icons/
```

## Environment Setup

### Prerequisites
- **Node.js**: v18+ recommended (ESM support required)
- **npm**: v8+ (comes with Node.js)
- **Git**: For version control
- **Platform-specific tools**:
  - Windows: No additional tools needed
  - macOS: Xcode Command Line Tools
  - Linux: Standard build tools (`build-essential` on Debian/Ubuntu)

### First-time Setup
```bash
# Clone repository
git clone <repository-url>
cd markpdfdown-desktop

# Install dependencies
npm install

# Generate Prisma client
npm run generate

# Run database migrations
npm run migrate:dev

# Start development server
npm run dev
```

### Environment Variables
Create `.env` file in project root (optional, for database URL override):
```env
DATABASE_URL="file:./dev.db"
```
Default SQLite database location: `src/server/db/dev.db` (gitignored)

## Testing

This project does not currently have a test suite configured. When adding tests:
- **Recommended Framework**: Vitest (integrates well with Vite)
- **Test File Naming**: Place tests alongside source files with `.test.ts` or `.spec.ts` suffix
- **Installation**: Add Vitest as dev dependency: `npm install -D vitest @vitest/ui`
- **Run Tests**: `vitest` (watch mode) or `vitest run` (single run)
- **Run Single Test**: `vitest run --reporter=verbose src/server/logic/File.test.ts`
- **Coverage**: `vitest run --coverage` (requires `@vitest/coverage-v8` or `@vitest/coverage-istanbul`)

## Code Style Guidelines

### TypeScript
- **Strict Mode**: Enabled globally - no `any` unless explicitly allowed by ESLint config
- **noUnusedLocals/noUnusedParameters**: 
  - Frontend (`tsconfig.app.json`): Enabled - remove unused declarations
  - Backend (`tsconfig.backend.json`): Not explicitly enabled
- **Module System**: ESM (type: "module" in package.json)
- **Module Alias**: 
  - `@` alias available in frontend only (via bundler resolution)
  - Backend uses relative imports (`../`, `./`) and `.js` extensions in imports

### ESLint Configuration
- **Config File**: `eslint.config.js` (flat config format, not `.eslintrc.cjs`)
- Extends TypeScript-ESLint recommended config
- Allows `any` type (`@typescript-eslint/no-explicit-any`: "off")
- Allows async promise executors (`no-async-promise-executor`: "off")
- React hooks enforcement enabled
- React refresh warnings enabled (allows constant exports)
- Ignores: `dist/**/*`, `release/**/*`

### Naming Conventions
- **Files**: 
  - Controllers: PascalCase (e.g., `TaskController.ts`, `ProviderController.ts`, `FileController.ts`)
  - DAL: PascalCase (e.g., `TaskDal.ts`, `ProviderDal.ts`, `modelDal.ts` - note: some use camelCase)
  - Logic: PascalCase (e.g., `Task.ts`, `File.ts`) or camelCase (e.g., `model.ts`)
  - Routes: PascalCase (e.g., `Routes.ts`)
  - **Recommendation**: Use PascalCase for consistency
- **Variables/Functions**: camelCase (e.g., `createTasks`, `getAllTasks`)
- **Constants**: SCREAMING_SNAKE_CASE for config values, camelCase for local constants
- **Classes/Interfaces**: PascalCase (e.g., `Task`, `Provider`)
- **Database Models**: PascalCase singular (e.g., `Provider`, `Task`, `Model`, `TaskDetail`)
- **DAL exports**: Default export object with methods (e.g., `export default { findAll, create, ... }`)

### Import Order
```typescript
// 1. Node.js built-ins
// 2. Third-party packages
// 3. @ aliases (frontend only - project imports)
// 4. Relative imports (./, ../)

// Backend example (no @ alias, uses .js extensions):
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import taskDal from '../dal/TaskDal.js';
import { prisma } from '../db/index.js';

// Frontend example (with @ alias):
import { useState } from 'react';
import { Button } from 'antd';
import Layout from '@/components/Layout';
import './styles.css';
```

### Backend Architecture (IPC)
- **IPC Handlers**: Handle IPC requests from renderer process (defined in `src/main/ipc/handlers.ts`)
  - All handlers use `ipcMain.handle()` for async request-response pattern
  - Return unified format: `{ success: boolean, data?: any, error?: string }`
  - Handle errors gracefully with try-catch
- **DAL**: Database operations via Prisma, return raw data
  - Export default object with CRUD methods (`findAll`, `findById`, `create`, `update`, `remove`, etc.)
- **Logic**: Business logic, orchestrate multiple DAL calls, file operations
  - `File.ts`: File handling logic (upload directory management, file deletion)
  - `Task.ts`: Task-related business logic (background task runner)
  - `model.ts`: Model-related business logic (LLM client factory)
  - `llm/`: LLM client implementations (OpenAI, Anthropic, Gemini, Azure OpenAI, Ollama)
- **No HTTP Server**: All communication via Electron IPC (no Express, no ports, no HTTP)

### Frontend Architecture (React)
- **Components**: Functional components with TypeScript (`.tsx` files)
- **UI Framework**: Ant Design v5 (`antd`)
  - Wrapped in `<AntdApp>` for global context (message, notification, modal)
  - Use `useApp()` hook for accessing Ant Design utilities
- **Routing**: React Router v7 with HashRouter
  - Routes: `/` (Home), `/list` (List), `/settings` (Settings), `/list/preview/:id` (Preview)
- **Styling**: Plain CSS files (e.g., `App.css`), no CSS modules by default
- **State Management**: React hooks (`useState`, `useEffect`) + Ant Design form/table state

### Internationalization (i18n)
- **Library**: react-i18next (v16.5.3)
- **Supported Languages**: Chinese (zh-CN), English (en-US)
- **Context Provider**: `<I18nProvider>` wraps the app at `src/renderer/App.tsx`
- **Key Files**:
  - `src/renderer/contexts/I18nContext.tsx` - Context provider with i18next initialization
  - `src/renderer/contexts/I18nContextDefinition.ts` - TypeScript type definitions
  - `src/renderer/hooks/useLanguage.ts` - Hook for language switching and Antd locale integration
  - `src/renderer/components/LanguageSwitcher.tsx` - Language switcher UI component
  - `src/renderer/locales/` - Translation files organized by namespace
- **Translation Namespaces**:
  - `common` - Common UI text (buttons, status labels, copyright)
  - `home` - Home page content
  - `list` - Task list page content
  - `upload` - File upload panel content
  - `provider` - Provider management content
  - `settings` - Settings page content
- **Usage**:
  ```typescript
  import { useTranslation } from 'react-i18next';

  // Basic usage
  const { t } = useTranslation('namespace');
  return <div>{t('key.path')}</div>

  // With variables
  return <div>{t('key.path', { variable: value })}</div>

  // Multiple namespaces
  const { t } = useTranslation('common');
  const { t: tProvider } = useTranslation('provider');
  ```
- **Language Switching**: Use `useLanguage()` hook to access `changeLanguage()` and `language` state
- **Antd Locale**: Automatically switches Ant Design component locale when language changes

### Error Handling
- Backend: IPC handlers wrap all logic in try-catch, return `{ success: false, error: message }`
- Frontend: Check `result.success`, show `message.error(result.error)` for failures
- Logging: Console logging in handlers with `[IPC]` prefix for debugging

### Prisma Database
- **Provider**: SQLite (configured in schema.prisma)
- **Schema Location**: `src/server/db/schema.prisma`
- **Migrations**: Store in `src/server/db/migrations/`
- **Client**: Generated via `npm run generate`, imported from `../db/index.js` (backend only)
- **Database Models**:
  - `Provider`: LLM service providers (id, name, type, api_key, base_url, suffix, status)
  - `Model`: LLM models (id, provider, name) - composite unique key on (id, provider)
  - `Task`: PDF conversion tasks (id, filename, type, page_range, pages, provider, model, progress, status)
  - `TaskDetail`: Individual page conversion details (id, task, page, page_source, status, provider, model, content)
- **Types**: Use Prisma-generated types, or define custom in `src/server/types/`
- **Initialization**: `initDatabase()` runs migrations on server start (via `src/server/db/migration.ts`)

### Git Workflow
- **Conventional Commits**: Use prefixes: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`, `perf`
- **Branch**: Main branch is `master`
- **No Force Pushes**: Never force push to main/master
- **Pre-commit**: Run `npm run lint` before committing
- **Lint-staged**: Configured for automatic linting/formatting on commit (requires husky setup)

### File Structure
```
src/
├── main/           # Electron main process
│   ├── ipc/        # IPC handlers
│   │   └── handlers.ts # All IPC request handlers (18 handlers)
│   └── index.ts    # Main process entry point
├── preload/        # Preload scripts for IPC
│   └── index.ts    # Preload script exposing window.api
├── renderer/       # React frontend
│   ├── components/ # Reusable UI components (About, AddProvider, Layout, MarkdownPreview, ModelService, Provider, UploadPanel, LanguageSwitcher)
│   ├── pages/      # Route pages (Home, List, Preview, Settings)
│   ├── contexts/   # React contexts (I18nContext for internationalization)
│   ├── hooks/      # Custom React hooks (useLanguage for i18n)
│   ├── locales/    # Translation files (zh-CN, en-US)
│   │   ├── index.ts
│   │   ├── zh-CN/  # Chinese translations (common, home, list, upload, provider, settings)
│   │   └── en-US/  # English translations (common, home, list, upload, provider, settings)
│   ├── electron.d.ts # TypeScript definitions for window.api
│   ├── App.tsx     # Root component (wrapped with I18nProvider)
│   └── main.tsx    # Frontend entry point
└── server/         # Backend logic (no HTTP server)
    ├── dal/        # Data access layer (TaskDal, providerDal, modelDal)
    ├── logic/      # Business logic
    │   ├── llm/    # LLM client implementations (OpenAIClient, AnthropicClient, GeminiClient, AzureOpenAIClient, OllamaClient)
    │   ├── File.ts # File handling logic
    │   ├── Task.ts # Task business logic
    │   └── model.ts # Model business logic
    ├── types/      # TypeScript types (Provider, Task)
    └── db/         # Prisma schema + migrations
        ├── schema.prisma # Database schema
        ├── migrations/   # Migration files
        ├── index.ts      # Prisma client export
        └── migration.ts  # Migration runner
```

### Adding New Features
1. Create Prisma schema changes in `src/server/db/schema.prisma`
2. Run `npm run migrate:dev` to create migration
3. Run `npm run generate` to update Prisma client
4. Add DAL methods in appropriate DAL file (e.g., `TaskDal.ts`, `providerDal.ts`)
5. Add business logic in `src/server/logic/` if needed
6. **Add IPC handler** in `src/main/ipc/handlers.ts`:
   ```typescript
   ipcMain.handle('feature:action', async (_, params) => {
     try {
       const result = await featureDal.action(params);
       return { success: true, data: result };
     } catch (error: any) {
       return { success: false, error: error.message };
     }
   });
   ```
7. **Add preload API** in `src/preload/index.ts`:
   ```typescript
   feature: {
     action: (params) => ipcRenderer.invoke('feature:action', params)
   }
   ```
8. **Update TypeScript types** in `src/renderer/electron.d.ts`
9. Update React frontend components to use `window.api.feature.action()`
10. **Add i18n translations** (if UI changes):
   ```typescript
   // Add translation keys to src/renderer/locales/zh-CN/namespace.json
   {
     "key": "中文文本"
   }

   // Add translation keys to src/renderer/locales/en-US/namespace.json
   {
     "key": "English text"
   }

   // Use in component
   const { t } = useTranslation('namespace');
   return <div>{t('key')}</div>
   ```
11. Run `npm run lint` and `npm run dev` to test

### IPC API Reference
All communication via `window.api.*` returning `Promise<IpcResponse>`:

**Providers**:
- `window.api.provider.getAll()` - Get all providers
- `window.api.provider.getById(id)` - Get provider by ID
- `window.api.provider.create(data)` - Create provider
- `window.api.provider.update(id, data)` - Update provider
- `window.api.provider.delete(id)` - Delete provider
- `window.api.provider.updateStatus(id, status)` - Update provider status

**Models**:
- `window.api.model.getAll()` - Get all models (grouped by provider)
- `window.api.model.getByProvider(providerId)` - Get models by provider
- `window.api.model.create(data)` - Create model
- `window.api.model.delete(id, provider)` - Delete model

**Tasks**:
- `window.api.task.create(tasks[])` - Create tasks (batch)
- `window.api.task.getAll({page, pageSize})` - Get tasks (paginated)
- `window.api.task.update(id, data)` - Update task
- `window.api.task.delete(id)` - Delete task

**Files**:
- `window.api.file.selectDialog()` - Open file selection dialog
- `window.api.file.upload(taskId, filePath)` - Upload file
- `window.api.file.uploadMultiple(taskId, filePaths[])` - Upload multiple files

**Completion**:
- `window.api.completion.markImagedown(providerId, modelId, url)` - Convert image to markdown
- `window.api.completion.testConnection(providerId, modelId)` - Test model connection

**Shell**:
- `window.api.shell.openExternal(url)` - Open URL in default browser

### Electron Build Configuration
- **Builder**: electron-builder
- **Output Directory**: `release/`
- **ASAR**: Enabled (with unpack for `.node`, `.dll`, `.metal`, `.exp`, `.lib` files)
- **Extra Resources**: 
  - Prisma client files (`node_modules/.prisma/**/*`, `node_modules/@prisma/client/**/*`)
  - Migration files (`src/server/db/migrations/*.sql` → `migrations/`)
- **Platform-specific**:
  - Windows: NSIS installer (one-click: false, allows custom install location)
  - macOS: DMG with `.icns` icon
  - Linux: AppImage with PNG icons
- **Artifact Naming**: `${productName}-${version}-${arch}.${ext}` (e.g., `MarkPDFdown-1.0.0-x64.exe`)
