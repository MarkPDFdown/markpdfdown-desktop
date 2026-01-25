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
│       ├── llm/       # LLM client implementations (OpenAI, Anthropic, etc.)
│       └── split/     # File splitter implementations (PDFSplitter, ImageSplitter)
├── application/       # Application-specific business logic
│   ├── services/      # Application services (WorkerOrchestrator, ModelService)
│   └── workers/       # Background processing workers
├── domain/            # Core business logic (interfaces and pure logic only)
│   ├── repositories/  # Data access layer
│   ├── split/         # Splitter interface and pure logic (ISplitter, PageRangeParser)
│   └── llm/           # LLM client interface and types (ILLMClient)
└── shared/            # Cross-cutting concerns
    └── events/        # Event bus for worker coordination
```

#### Infrastructure Layer (`src/core/infrastructure/`)
- **Database** (`db/`): Prisma client and migration runner
- **Config** (`config/`): Worker configuration (`worker.config.ts`)
- **Services** (`services/`): Infrastructure services
  - `FileService.ts`: File handling logic (upload directory management, file deletion)
- **Adapters** (`adapters/`): External service implementations
  - `llm/`: LLM client implementations (depends on external SDKs)
    - `LLMClient.ts`: Abstract base class and factory (implements `ILLMClient`)
    - `OpenAIClient.ts`, `AnthropicClient.ts`, `GeminiClient.ts`, `OllamaClient.ts`, `OpenAIResponsesClient.ts`
  - `split/`: File splitter implementations (depends on fs, pdf-lib, etc.)
    - `PDFSplitter.ts`, `ImageSplitter.ts`: Concrete implementations (implement `ISplitter`)
    - `SplitterFactory.ts`: Factory for creating splitters
    - `ImagePathUtil.ts`: Image path utilities (uses `path` module)

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
The domain layer contains **only interfaces and pure business logic** with no external dependencies.
- **Repositories** (`repositories/`): Data access layer
  - Export default object with CRUD methods (`findAll`, `findById`, `create`, `update`, `remove`, etc.)
  - `ProviderRepository`, `ModelRepository`, `TaskRepository`, `TaskDetailRepository`
- **Split** (`split/`): Splitter interfaces and pure logic (no fs/path dependencies)
  - `ISplitter.ts`: Splitter interface and types (`PageInfo`, `SplitResult`)
  - `PageRangeParser.ts`: Pure string parsing logic for page ranges
- **LLM** (`llm/`): LLM client interfaces and types (no SDK dependencies)
  - `ILLMClient.ts`: Interface and all type definitions (`Message`, `CompletionOptions`, `CompletionResponse`, etc.)

#### Shared Layer (`src/core/shared/`)
- **Events** (`events/`): Event-driven communication
  - `EventBus.ts`: Pub/sub system for worker coordination

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
- **Supported Languages**:
  - English (en-US)
  - Chinese Simplified (zh-CN)
  - Japanese (ja-JP)
  - Russian (ru-RU)
  - Arabic (ar-SA)
  - Persian (fa-IR)
- **Context Provider**: `<I18nProvider>` wraps the app at `src/renderer/App.tsx`
- **Key Files**:
  - `src/renderer/contexts/I18nContext.tsx` - Context provider with i18next initialization
  - `src/renderer/contexts/I18nContextDefinition.ts` - TypeScript type definitions
  - `src/renderer/hooks/useLanguage.ts` - Hook for language switching and Antd locale integration
  - `src/renderer/components/LanguageSwitcher.tsx` - Language switcher UI component
  - `src/renderer/locales/` - Translation files organized by language and namespace
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
- **Schema Location**: `src/core/infrastructure/db/schema.prisma`
- **Migrations**: Store in `src/core/infrastructure/db/migrations/`
- **Client**: Generated via `npm run generate`, imported from `../db/index.js` (backend only)
- **Database Models**:
  - `Provider`: LLM service providers (id, name, type, api_key, base_url, suffix, status)
  - `Model`: LLM models (id, provider, name) - composite unique key on (id, provider)
  - `Task`: PDF conversion tasks (id, filename, type, page_range, pages, provider, model, progress, status)
  - `TaskDetail`: Individual page conversion details (id, task, page, page_source, status, provider, model, content)
- **Types**: Use Prisma-generated types, or define custom in `src/core/types/`
- **Initialization**: `initDatabase()` runs migrations on server start (via `src/core/infrastructure/db/Migration.ts`)

### Git Workflow
- **Conventional Commits**: Use prefixes: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`, `perf`, `ci`, `build`, `revert`
  - Format: `type(scope): description` (scope is optional)
  - Example: `feat(auth): ✨ add login feature`
  - CI validates commit messages on push/PR to master (merge commits are excluded)
- **Branch**: Main branch is `master`
- **No Force Pushes**: Never force push to main/master
- **Pre-commit**: Run `npm run lint` before committing
- **Lint-staged**: Configured for automatic linting/formatting on commit (requires husky setup)
- **CI Workflows** (`.github/workflows/`):
  - `ci.yml` - Runs on push/PR to master: commit validation, typecheck, lint, test, build
  - `changelog.yml` - Auto-updates CHANGELOG.md on release
  - `draft-release.yml` - Creates draft release on tag push
  - `release.yml` - Builds and uploads assets on release, publishes to npm

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
15. **Add i18n translations** (if UI changes)
16. **Run tests** to ensure everything works:
   ```bash
   npm run test:unit        # Run unit tests
   npm run test:renderer    # Run component tests (if applicable)
   npm run test:coverage    # Check coverage
   ```
17. Run `npm run lint` and `npm run typecheck` and `npm run dev` to test


### Electron Build Configuration
- **Builder**: electron-builder
- **Output Directory**: `release/`
- **ASAR**: Enabled (with unpack for `.node`, `.dll`, `.metal`, `.exp`, `.lib` files)
- **Extra Resources**:
  - Prisma client files (`node_modules/.prisma/**/*`, `node_modules/@prisma/client/**/*`)
  - Migration files (`src/core/infrastructure/db/migrations/*.sql` → `migrations/`)
- **Platform-specific**:
  - Windows: NSIS installer (one-click: false, allows custom install location)
  - macOS: DMG with `.icns` icon
  - Linux: AppImage with PNG icons
- **Artifact Naming**: `${productName}-${version}-${arch}.${ext}` (e.g., `MarkPDFdown-1.0.0-x64.exe`)

### IPC API Reference

For complete IPC API documentation, see: **[docs/IPC_API.md](./docs/IPC_API.md)**
