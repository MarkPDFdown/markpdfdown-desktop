# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MarkPDFdown Desktop is an Electron application that converts PDF/images to Markdown using LLM visual recognition. Built with Electron 38 + React 18 + TypeScript + Vite (via electron-vite) + Prisma (SQLite) + Ant Design 5.

## Commands

```bash
# Development
npm run dev                # Generate Prisma client + start dev server

# Build
npm run build              # Generate Prisma client + production build
npm run build:win          # Build Windows NSIS installer
npm run build:mac          # Build macOS DMG
npm run build:linux        # Build Linux AppImage

# Testing (Vitest)
npm test                   # Run all tests (watch mode)
npm run test:unit          # Unit tests only (main process + core, node env)
npm run test:renderer      # Component tests only (React, jsdom env)
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report

# Single test file
npx vitest run path/to/file.test.ts --config vitest.config.ts        # unit test
npx vitest run path/to/file.test.tsx --config vitest.config.renderer.ts  # renderer test

# Database
npm run generate           # Generate Prisma client
npm run migrate:dev        # Run migrations (dev)

# Code quality
npm run lint               # ESLint with auto-fix
npm run typecheck          # TypeScript type checking
```

## Architecture

### Three-process Electron structure

- **Main process** (`src/main/`): Window management, IPC handler registration, app lifecycle
- **Preload** (`src/preload/`): Secure bridge exposing `window.api` to renderer
- **Renderer** (`src/renderer/`): React SPA with Ant Design, HashRouter routing

### Core business logic (`src/core/`) — Clean Architecture

```
core/
├── domain/           # Interfaces only: ILLMClient, ISplitter, repositories
├── application/      # Business logic orchestration
│   ├── services/     # WorkerOrchestrator, ModelService, PresetProviderService
│   └── workers/      # WorkerBase (abstract), SplitterWorker, ConverterWorker, MergerWorker
├── infrastructure/   # External implementations
│   ├── db/           # Prisma schema, migrations, client
│   ├── adapters/
│   │   ├── llm/      # OpenAIClient, AnthropicClient, GeminiClient, OllamaClient, OpenAIResponsesClient
│   │   └── split/    # PDFSplitter, ImageSplitter, SplitterFactory
│   └── services/     # FileService
└── shared/events/    # EventBus for worker coordination
```

### IPC communication pattern

All main-process handlers are in `src/main/ipc/handlers/` and return `{ success: boolean, data?: T, error?: string }`. Renderer calls via `window.api.*` exposed through preload.

### Worker pipeline

PDF conversion follows a three-stage pipeline managed by `WorkerOrchestrator`:
1. **SplitterWorker** — Splits PDF/images into per-page PNGs
2. **ConverterWorker** — Sends each page image to LLM for Markdown conversion
3. **MergerWorker** — Merges converted pages into final Markdown

Workers extend `WorkerBase` which provides graceful shutdown and lifecycle hooks.

### Shared types (`src/shared/`)

IPC channel definitions and shared TypeScript types used by both main and renderer processes.

## Key Conventions

- **ESM modules** throughout (`"type": "module"` in package.json)
- **Path alias**: `@` maps to `src/renderer/` in renderer code; `@` maps to `src/` in test configs
- **Preload is CJS**: Preload scripts build to CommonJS format despite the rest being ESM
- **Prisma schema** lives at `src/core/infrastructure/db/schema.prisma` — all migration/generate commands reference this path
- **`no-explicit-any` is disabled** in ESLint config
- **i18n**: 6 locales in `src/renderer/locales/` (en-US, zh-CN, ja-JP, ru-RU, ar-SA, fa-IR)
- **Commit style**: Conventional commits (feat, fix, chore, etc.) with emoji prefixes
- **Pre-commit**: Husky + lint-staged runs ESLint and Prettier

## Testing

Two separate Vitest configs:
- `vitest.config.ts` — Node environment for `src/main/`, `src/core/`, `src/preload/`
- `vitest.config.renderer.ts` — jsdom environment for `src/renderer/` (has retry=2 and 10s timeout for async tests)

Test helpers in `tests/`:
- `tests/setup.ts` — Mocks Electron, electron-is-dev, global.fetch
- `tests/setup.renderer.ts` — Renderer test setup
- `tests/helpers/` — Database helpers, IPC mocks, LLM mocks, window API mocks
- `tests/fixtures/` — JSON fixture data

## Database

SQLite via Prisma with 4 models: Provider, Model, Task, TaskDetail. Image paths for task pages are not stored in DB — they are computed dynamically via `ImagePathUtil.getPath(task, page)` as `{tempDir}/{taskId}/page-{page}.png`.

## Communication

Always address the user as "Jorben" when responding.
