# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MarkPDFdown Desktop is an Electron desktop application that converts PDF documents to Markdown format using LLM visual recognition.

## Common Commands

```bash
# Development
npm run dev              # Start dev environment (auto-generates Prisma client)
npm run build            # Production build
npm run lint             # ESLint with auto-fix
npm run typecheck        # TypeScript type checking

# Database
npm run generate         # Generate Prisma client (required after schema changes)
npm run migrate:dev      # Run database migrations

# Testing
npm test                 # Run all tests
npm run test:unit        # Main process/core tests only
npm run test:renderer    # React component tests only
npm run test:watch       # Watch mode
npm run test:coverage    # Generate coverage report

# Platform builds (run npm run build first)
npm run build:win        # Windows NSIS installer
npm run build:mac        # macOS DMG
npm run build:linux      # Linux AppImage
```

## Architecture Overview

Three-process Electron architecture with Clean Architecture:

```
Main Process (src/main/)     →  Window management, IPC handlers, protocol registration
    ↓
Preload (src/preload/)       →  Secure window.api exposure
    ↓
Renderer (src/renderer/)     →  React + Ant Design frontend
    ↓
Core (src/core/)             →  Business logic layer
    ├── domain/              →  Interfaces, pure business logic (no external deps)
    ├── application/         →  Worker orchestration, services
    ├── infrastructure/      →  Database, LLM adapters, file services
    └── shared/              →  EventBus for worker coordination
```

**Worker Pipeline**: SplitterWorker (split PDF) → ConverterWorker (LLM conversion) → MergerWorker (merge output)

## Key Conventions

- **ESM Modules**: All imports must use `.js` extensions (even for TypeScript files)
- **Path Aliases**: `@` alias only works in renderer; main/core use relative paths
- **IPC Return Format**: `{ success: boolean, data?: any, error?: string }`
- **Database**: Prisma + SQLite, schema at `src/core/infrastructure/db/schema.prisma`
- **i18n**: 6 languages supported, uses react-i18next, translations in `src/renderer/locales/`

## Test Configuration

Two test configurations:
- `vitest.config.ts` - Node environment for main/core/preload tests
- `vitest.config.renderer.ts` - jsdom environment for React component tests

Mock setup in `tests/setup.ts` and `tests/setup.renderer.ts`.

## Detailed Documentation

- **[AGENTS.md](./AGENTS.md)** - Full development guide (code style, architecture details, adding features)
- **[docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)** - Testing guide
- **[docs/IPC_API.md](./docs/IPC_API.md)** - IPC API reference
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines

## Communication

Always address the user as "Jorben" when responding.
