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
Default SQLite database location: `src/core/infrastructure/db/dev.db` (gitignored)

## Testing

本项目已配置完整的测试套件，使用 Vitest 作为测试框架。

### 测试命令
```bash
# 运行所有测试
npm test

# 运行单元测试（main/server）
npm run test:unit

# 运行渲染进程测试（React 组件）
npm run test:renderer

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 测试统计
- **测试文件数**: 30 个
- **测试用例数**: 72+ 个 (单元测试)
- **覆盖率**: >75% (LLM Clients: 90-95%)

### 测试覆盖范围
- ✅ **LLM 客户端**: OpenAI, Anthropic, Gemini, Ollama, OpenAI Responses
- ✅ **IPC 处理器**: 所有 Provider/Model/Task/TaskDetail/File/Completion 操作
- ✅ **数据访问层**: Provider, Model, Task DAL
- ✅ **Repositories**: Provider, Model, Task, TaskDetail
- ✅ **业务逻辑**: File, Model, Task 逻辑
- ✅ **Workers**: WorkerBase, SplitterWorker, ConverterWorker, MergerWorker
- ✅ **Events**: EventBus
- ✅ **Splitters**: PDFSplitter, ImageSplitter, SplitterFactory, PageRangeParser
- ✅ **React 组件**: UploadPanel

### 测试文件位置
- 单元测试: `src/**/__tests__/*.test.ts`
- 组件测试: `src/renderer/components/__tests__/*.test.tsx`
- IPC 测试: `src/main/ipc/__tests__/*.test.ts`
- 核心模块测试: `src/core/**/__tests__/*.test.ts`
- 测试辅助: `tests/helpers/`, `tests/fixtures/`
- 配置文件: `vitest.config.ts`, `vitest.config.renderer.ts`

### 详细文档
完整的测试指南请参阅: **[docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)**

包含内容:
- 测试框架和工具介绍
- 所有测试文件详细说明
- 测试模式和最佳实践
- Mock 策略和测试隔离
- 故障排查指南
- 覆盖率目标和成功标准

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

### Backend Architecture (Clean Architecture)
The backend follows clean architecture principles with clear separation of concerns, organized into four layers:

#### Layer Structure
```
src/core/
├── infrastructure/     # External dependencies (database, config, adapters)
│   ├── db/            # Prisma database client and migrations
│   ├── config/        # Worker configuration
│   ├── services/      # Infrastructure services (FileService)
│   └── adapters/      # External service adapters
│       └── llm/       # LLM client implementations
├── application/       # Application-specific business logic
│   ├── services/      # Application services (WorkerOrchestrator, ModelService)
│   └── workers/       # Background processing workers
├── domain/            # Core business logic
│   ├── repositories/  # Data access layer
│   └── split/         # PDF/Image splitting logic
└── shared/            # Cross-cutting concerns
    ├── events/        # Event bus for worker coordination
    └── di/            # Dependency injection container
```

#### Infrastructure Layer (`src/core/infrastructure/`)
- **Database** (`db/`): Prisma client and migration runner
- **Config** (`config/`): Worker configuration (`worker.config.ts`)
- **Services** (`services/`): Infrastructure services
  - `FileService.ts`: File handling logic (upload directory management, file deletion)
- **Adapters** (`adapters/llm/`): LLM client implementations
  - `LLMClient.ts`: Abstract base class and factory
  - `OpenAIClient.ts`, `AnthropicClient.ts`, `GeminiClient.ts`, `OllamaClient.ts`, `OpenAIResponsesClient.ts`

#### Application Layer (`src/core/application/`)
- **Services** (`services/`):
  - `WorkerOrchestrator.ts`: Manages worker lifecycle and coordination
  - `ModelService.ts`: Model-related business logic (LLM client factory)
- **Workers** (`workers/`): Background processing
  - `WorkerBase.ts`: Abstract base class with graceful shutdown support
  - `SplitterWorker.ts`: Splits PDFs/images into pages
  - `ConverterWorker.ts`: Converts pages to markdown via LLM
  - `MergerWorker.ts`: Merges converted pages into final output

#### Domain Layer (`src/core/domain/`)
- **Repositories** (`repositories/`): Data access layer
  - Export default object with CRUD methods (`findAll`, `findById`, `create`, `update`, `remove`, etc.)
  - `ProviderRepository`, `ModelRepository`, `TaskRepository`, `TaskDetailRepository`
- **Split** (`split/`): File splitting logic
  - `ISplitter.ts`: Splitter interface
  - `PDFSplitter.ts`, `ImageSplitter.ts`: Concrete implementations
  - `SplitterFactory.ts`: Factory for creating splitters
  - `PageRangeParser.ts`: Page range parsing
  - `ImagePathUtil.ts`: Image path utilities

#### Shared Layer (`src/core/shared/`)
- **Events** (`events/`): Event-driven communication
  - `EventBus.ts`: Pub/sub system for worker coordination
- **DI** (`di/`): Dependency injection
  - `Container.ts`: Creates and manages dependencies
  - `getContainer()`: Get singleton container instance
  - `setContainer()`: Override for testing

#### IPC Handlers (`src/main/ipc/handlers/`)
- Handle IPC requests from renderer process
- Modular handler files: `provider.handler.ts`, `model.handler.ts`, `task.handler.ts`, etc.
- All handlers use `ipcMain.handle()` for async request-response pattern
- Return unified format: `{ success: boolean, data?: any, error?: string }`
- Handle errors gracefully with try-catch

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
- **Schema Location**: `src/core/db/schema.prisma`
- **Migrations**: Store in `src/core/db/migrations/`
- **Client**: Generated via `npm run generate`, imported from `../db/index.js` (backend only)
- **Database Models**:
  - `Provider`: LLM service providers (id, name, type, api_key, base_url, suffix, status)
  - `Model`: LLM models (id, provider, name) - composite unique key on (id, provider)
  - `Task`: PDF conversion tasks (id, filename, type, page_range, pages, provider, model, progress, status)
  - `TaskDetail`: Individual page conversion details (id, task, page, page_source, status, provider, model, content)
- **Types**: Use Prisma-generated types, or define custom in `src/core/types/`
- **Initialization**: `initDatabase()` runs migrations on server start (via `src/core/db/Migration.ts`)

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
│   │   ├── handlers.ts    # Entry point (re-exports from handlers/)
│   │   └── handlers/      # Modular IPC handlers
│   │       ├── index.ts            # Handler registration
│   │       ├── provider.handler.ts # Provider CRUD handlers
│   │       ├── model.handler.ts    # Model CRUD handlers
│   │       ├── task.handler.ts     # Task CRUD handlers
│   │       ├── taskDetail.handler.ts # TaskDetail handlers
│   │       ├── file.handler.ts     # File operation handlers
│   │       └── completion.handler.ts # LLM completion handlers
│   └── index.ts    # Main process entry point
├── preload/        # Preload scripts for IPC
│   └── index.ts    # Preload script exposing window.api
├── shared/         # Shared code between main and renderer
│   ├── ipc/        # IPC channel definitions
│   └── types/      # Shared TypeScript types
├── renderer/       # React frontend
│   ├── components/ # Reusable UI components
│   ├── pages/      # Route pages (Home, List, Preview, Settings)
│   ├── contexts/   # React contexts (I18nContext)
│   ├── hooks/      # Custom React hooks (useLanguage)
│   ├── locales/    # Translation files (zh-CN, en-US)
│   ├── electron.d.ts # TypeScript definitions for window.api
│   ├── App.tsx     # Root component
│   └── main.tsx    # Frontend entry point
└── core/           # Core business logic (Clean Architecture)
    ├── index.ts    # Top-level exports
    │
    ├── infrastructure/  # External dependencies layer
    │   ├── index.ts
    │   ├── db/          # Database
    │   │   ├── schema.prisma
    │   │   ├── migrations/
    │   │   ├── index.ts      # Prisma client export
    │   │   └── Migration.ts
    │   ├── config/      # Configuration
    │   │   └── worker.config.ts
    │   ├── services/    # Infrastructure services
    │   │   ├── FileService.ts
    │   │   └── __tests__/
    │   └── adapters/    # External adapters
    │       └── llm/     # LLM client implementations
    │           ├── LLMClient.ts
    │           ├── OpenAIClient.ts
    │           ├── AnthropicClient.ts
    │           ├── GeminiClient.ts
    │           ├── OllamaClient.ts
    │           ├── OpenAIResponsesClient.ts
    │           └── __tests__/
    │
    ├── application/     # Application logic layer
    │   ├── index.ts
    │   ├── services/    # Application services
    │   │   ├── WorkerOrchestrator.ts
    │   │   ├── ModelService.ts
    │   │   ├── interfaces/
    │   │   └── __tests__/
    │   └── workers/     # Background workers
    │       ├── WorkerBase.ts
    │       ├── SplitterWorker.ts
    │       ├── ConverterWorker.ts
    │       ├── MergerWorker.ts
    │       └── __tests__/
    │
    ├── domain/          # Domain logic layer
    │   ├── index.ts
    │   ├── repositories/ # Data access
    │   │   ├── ProviderRepository.ts
    │   │   ├── ModelRepository.ts
    │   │   ├── TaskRepository.ts
    │   │   ├── TaskDetailRepository.ts
    │   │   └── __tests__/
    │   └── split/       # Splitting logic
    │       ├── ISplitter.ts
    │       ├── PDFSplitter.ts
    │       ├── ImageSplitter.ts
    │       ├── SplitterFactory.ts
    │       ├── PageRangeParser.ts
    │       ├── ImagePathUtil.ts
    │       └── __tests__/
    │
    ├── shared/          # Cross-cutting concerns
    │   ├── index.ts
    │   ├── events/      # Event system
    │   │   ├── EventBus.ts
    │   │   └── __tests__/
    │   └── di/          # Dependency injection
    │       ├── Container.ts
    │       └── __tests__/
```

### Adding New Features
1. Create Prisma schema changes in `src/core/infrastructure/db/schema.prisma`
2. Run `npm run migrate:dev` to create migration
3. Run `npm run generate` to update Prisma client
4. Add Repository in `src/core/domain/repositories/`:
   ```typescript
   // Example: src/core/domain/repositories/FeatureRepository.ts
   import { prisma } from '../../infrastructure/db/index.js';

   const featureRepository = {
     findAll: () => prisma.feature.findMany(),
     findById: (id: number) => prisma.feature.findUnique({ where: { id } }),
     create: (data) => prisma.feature.create({ data }),
     update: (id, data) => prisma.feature.update({ where: { id }, data }),
     remove: (id) => prisma.feature.delete({ where: { id } }),
   };

   export default featureRepository;
   ```
5. **Add tests for Repository** in `src/core/domain/repositories/__tests__/`:
   ```typescript
   // Example: FeatureRepository.test.ts
   import { describe, it, expect, beforeEach, vi } from 'vitest'
   import { mockDeep, mockReset } from 'vitest-mock-extended'
   import { PrismaClient } from '@prisma/client'
   import featureRepository from '../FeatureRepository.js'

   const prismaMock = mockDeep<PrismaClient>()
   vi.mock('../../../infrastructure/db/index.js', () => ({ prisma: prismaMock }))

   describe('featureRepository', () => {
     beforeEach(() => { mockReset(prismaMock) })

     it('should create feature', async () => {
       prismaMock.feature.create.mockResolvedValue({ id: 1, name: 'test' })
       const result = await featureRepository.create({ name: 'test' })
       expect(result.id).toBe(1)
     })
   })
   ```
6. Add application services in `src/core/application/services/` if needed
7. **Add tests for services** in `src/core/application/services/__tests__/` if applicable
8. **Add IPC handler** in `src/main/ipc/handlers/feature.handler.ts`:
   ```typescript
   import { ipcMain } from 'electron';
   import featureRepository from '../../../core/domain/repositories/FeatureRepository.js';

   export function registerFeatureHandlers() {
     ipcMain.handle('feature:action', async (_, params) => {
       try {
         const result = await featureRepository.action(params);
         return { success: true, data: result };
       } catch (error: any) {
         return { success: false, error: error.message };
       }
     });
     console.log('[IPC] Feature handlers registered');
   }
   ```
9. Register handler in `src/main/ipc/handlers/index.ts`
10. **Add tests for IPC handler** in `src/main/ipc/__tests__/handlers.test.ts`:
   ```typescript
   it('should handle feature:action', async () => {
     const mockData = { id: 1, name: 'test' }
     vi.mocked(featureRepository.action).mockResolvedValue(mockData)

     const result = await handlers.get('feature:action')!(null, params)

     expect(result.success).toBe(true)
     expect(result.data).toEqual(mockData)
   })
   ```
11. **Add preload API** in `src/preload/index.ts`:
   ```typescript
   feature: {
     action: (params) => ipcRenderer.invoke('feature:action', params)
   }
   ```
12. **Update TypeScript types** in `src/renderer/electron.d.ts`
13. Update React frontend components to use `window.api.feature.action()`
14. **Add component tests** in `src/renderer/components/__tests__/` (if new component):
   ```typescript
   import { render, screen, waitFor } from '@testing-library/react'
   import userEvent from '@testing-library/user-event'
   import FeatureComponent from '../FeatureComponent'

   describe('FeatureComponent', () => {
     it('should render and interact', async () => {
       window.api.feature.action = vi.fn().mockResolvedValue({ success: true })
       render(<FeatureComponent />)
       const button = screen.getByRole('button')
       await userEvent.click(button)
       expect(window.api.feature.action).toHaveBeenCalled()
     })
   })
   ```
15. **Add i18n translations** (if UI changes):
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
16. **Run tests** to ensure everything works:
   ```bash
   npm run test:unit        # Run unit tests
   npm run test:renderer    # Run component tests (if applicable)
   npm run test:coverage    # Check coverage
   ```
17. Run `npm run lint` and `npm run dev` to test

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
  - Migration files (`src/core/db/migrations/*.sql` → `migrations/`)
- **Platform-specific**:
  - Windows: NSIS installer (one-click: false, allows custom install location)
  - macOS: DMG with `.icns` icon
  - Linux: AppImage with PNG icons
- **Artifact Naming**: `${productName}-${version}-${arch}.${ext}` (e.g., `MarkPDFdown-1.0.0-x64.exe`)
