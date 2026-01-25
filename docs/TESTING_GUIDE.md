# Testing Guide

This project has a comprehensive test suite using Vitest as the testing framework.

## Test Commands

```bash
# Run all tests
npm test

# Run unit tests (main/core)
npm run test:unit

# Run renderer tests (React components)
npm run test:renderer

# Watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Framework and Tools

- **Vitest 2.1.8**: Modern testing framework with Vite integration
- **@testing-library/react 14.0.0**: React component testing
- **@testing-library/user-event 14.5.1**: User event simulation
- **vitest-mock-extended 2.0.2**: Enhanced mocking capabilities
- **@vitest/coverage-v8**: Code coverage reporting

## Test Structure

### Configuration Files

| File | Description |
|------|-------------|
| `vitest.config.ts` | Main/core process test configuration |
| `vitest.config.renderer.ts` | Renderer process (React) test configuration |
| `tests/setup.ts` | Global test setup (Node environment) |
| `tests/setup.renderer.ts` | Renderer test setup (jsdom) |

### Test Helpers

| File | Description |
|------|-------------|
| `tests/helpers/database.ts` | Prisma mock utilities |
| `tests/helpers/ipc-mock.ts` | Electron IPC mock |
| `tests/helpers/mock-llm.ts` | LLM API response mock |
| `tests/helpers/window-api-mock.ts` | Renderer window.api mock |

### Test Fixtures

| File | Description |
|------|-------------|
| `tests/fixtures/providers.json` | Provider test data |
| `tests/fixtures/models.json` | Model test data |
| `tests/fixtures/tasks.json` | Task test data |

---

## Test Files Overview (47 test files)

### Infrastructure Layer

#### LLM Clients (7 files)

| File | Tests | Description |
|------|-------|-------------|
| `src/core/infrastructure/adapters/llm/__tests__/OpenAIClient.test.ts` | 22 | Message format conversion, streaming, tool calls |
| `src/core/infrastructure/adapters/llm/__tests__/AnthropicClient.test.ts` | 18 | Anthropic message format, system messages, base64 images |
| `src/core/infrastructure/adapters/llm/__tests__/GeminiClient.test.ts` | 18 | Gemini contents/parts format, inline_data images |
| `src/core/infrastructure/adapters/llm/__tests__/OllamaClient.test.ts` | 19 | Ollama local API, image arrays, streaming |
| `src/core/infrastructure/adapters/llm/__tests__/OpenAIResponsesClient.test.ts` | 19 | Responses API input/output format |
| `src/core/infrastructure/adapters/llm/__tests__/LLMClient.test.ts` | 15 | Base class backward compatibility |
| `src/core/infrastructure/adapters/llm/__tests__/LLMClientFactory.test.ts` | 8 | Client factory creation |

#### Splitter Adapters (4 files)

| File | Description |
|------|-------------|
| `src/core/infrastructure/adapters/split/__tests__/PDFSplitter.test.ts` | PDF splitting functionality |
| `src/core/infrastructure/adapters/split/__tests__/ImageSplitter.test.ts` | Image splitting functionality |
| `src/core/infrastructure/adapters/split/__tests__/SplitterFactory.test.ts` | Splitter factory creation |
| `src/core/infrastructure/adapters/split/__tests__/ImagePathUtil.test.ts` | Image path utilities |

#### Infrastructure Services (2 files)

| File | Description |
|------|-------------|
| `src/core/infrastructure/services/__tests__/FileService.test.ts` | File handling operations |
| `src/core/infrastructure/config/__tests__/worker.config.test.ts` | Worker configuration |

### Domain Layer

#### Repositories (4 files)

| File | Description |
|------|-------------|
| `src/core/domain/repositories/__tests__/ProviderRepository.test.ts` | Provider CRUD operations |
| `src/core/domain/repositories/__tests__/ModelRepository.test.ts` | Model CRUD operations |
| `src/core/domain/repositories/__tests__/TaskRepository.test.ts` | Task CRUD operations, pagination |
| `src/core/domain/repositories/__tests__/TaskDetailRepository.test.ts` | Task detail operations |

#### Domain Logic (1 file)

| File | Description |
|------|-------------|
| `src/core/domain/split/__tests__/PageRangeParser.test.ts` | Page range string parsing |

### Application Layer

#### Services (2 files)

| File | Description |
|------|-------------|
| `src/core/application/services/__tests__/ModelService.test.ts` | Model service business logic |
| `src/core/application/services/__tests__/WorkerOrchestrator.test.ts` | Worker orchestration |

#### Workers (4 files)

| File | Description |
|------|-------------|
| `src/core/application/workers/__tests__/WorkerBase.test.ts` | Base worker functionality |
| `src/core/application/workers/__tests__/SplitterWorker.test.ts` | PDF/image splitting worker |
| `src/core/application/workers/__tests__/ConverterWorker.test.ts` | Page to markdown conversion worker |
| `src/core/application/workers/__tests__/MergerWorker.test.ts` | Markdown merging worker |

### Shared Layer (2 files)

| File | Description |
|------|-------------|
| `src/core/shared/events/__tests__/EventBus.test.ts` | Event bus pub/sub system |
| `src/core/shared/di/__tests__/Container.test.ts` | Dependency injection container |

### Main Process

#### Window Management (1 file)

| File | Description |
|------|-------------|
| `src/main/__tests__/WindowManager.test.ts` | Electron window management |

#### IPC Handlers (8 files)

| File | Description |
|------|-------------|
| `src/main/ipc/__tests__/handlers.test.ts` | Legacy IPC handlers |
| `src/main/ipc/__tests__/eventBridge.test.ts` | IPC event bridge |
| `src/main/ipc/handlers/__tests__/provider.handler.test.ts` | Provider IPC handlers |
| `src/main/ipc/handlers/__tests__/model.handler.test.ts` | Model IPC handlers |
| `src/main/ipc/handlers/__tests__/task.handler.test.ts` | Task IPC handlers |
| `src/main/ipc/handlers/__tests__/taskDetail.handler.test.ts` | Task detail IPC handlers |
| `src/main/ipc/handlers/__tests__/file.handler.test.ts` | File IPC handlers |
| `src/main/ipc/handlers/__tests__/completion.handler.test.ts` | Completion IPC handlers |

### Renderer Process (React)

#### Components (8 files)

| File | Description |
|------|-------------|
| `src/renderer/components/__tests__/UploadPanel.test.tsx` | File upload panel |
| `src/renderer/components/__tests__/Provider.test.tsx` | Provider management |
| `src/renderer/components/__tests__/AddProvider.test.tsx` | Add provider form |
| `src/renderer/components/__tests__/ModelService.test.tsx` | Model service settings |
| `src/renderer/components/__tests__/MarkdownPreview.test.tsx` | Markdown preview |
| `src/renderer/components/__tests__/Layout.test.tsx` | App layout |
| `src/renderer/components/__tests__/LanguageSwitcher.test.tsx` | Language switcher |
| `src/renderer/components/__tests__/About.test.tsx` | About dialog |

#### Pages (4 files)

| File | Description |
|------|-------------|
| `src/renderer/pages/__tests__/Home.test.tsx` | Home page |
| `src/renderer/pages/__tests__/List.test.tsx` | Task list page |
| `src/renderer/pages/__tests__/Preview.test.tsx` | Task preview page |
| `src/renderer/pages/__tests__/Settings.test.tsx` | Settings page |

---

## Test Statistics

```
Unit Tests (test:unit):
  Test Suites: 295 passed
  Tests: 757 passed

Renderer Tests (test:renderer):
  Test Suites: 15 (12 passed, 3 with failures)
  Tests: 100+ (most passing)
```

---

## Testing Best Practices

### Mock Strategy

- **External dependencies**: All mocked (electron, fs, path, fetch)
- **Database**: Use vitest-mock-extended to mock Prisma
- **LLM API**: Mock fetch responses
- **IPC**: Mock ipcMain and dialog

### Test Isolation

- Reset all mocks before each test
- Use `beforeEach` to clean state
- Avoid dependencies between tests

### Test Structure

```typescript
describe('FeatureName', () => {
  describe('Scenario', () => {
    it('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    })
  })
})
```

---

## Coverage Report

Coverage reports are generated in the `coverage/` directory:
- **HTML report**: View detailed coverage in browser
- **JSON report**: For CI/CD integration
- **Text report**: Terminal summary

---

## Troubleshooting

### Common Issues

1. **Module import errors**
   - Ensure all import paths use `.js` extension (ESM requirement)
   - Check mock paths are correct

2. **Mock not properly set up**
   - Ensure mocks are set before importing modules
   - Use `vi.mock()` at file top

3. **Async test timeout**
   - Ensure using `await` or `return Promise`
   - Check mock functions return Promises correctly

4. **Prisma Mock issues**
   - Use `mockDeep<PrismaClient>()`
   - Use `mockReset()` in beforeEach

5. **React component test issues**
   - Ensure components are properly wrapped (Router, App)
   - Use `waitFor` for async updates

---

## Adding New Tests

1. Create `__tests__` folder in the corresponding directory
2. Name test files: `*.test.ts` or `*.test.tsx`
3. Follow existing test patterns
4. Ensure tests are independent and repeatable
5. Add meaningful test descriptions

### Example: Repository Test

```typescript
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

### Example: React Component Test

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

---

## CI Integration

The project uses GitHub Actions for CI. Tests run on every push/PR to master:

```yaml
# .github/workflows/ci.yml
- name: Run unit tests
  run: npm run test:unit

- name: Run renderer tests
  run: npm run test:renderer

- name: Generate coverage
  run: npm run test:coverage
```

---

**Last Updated**: 2026-01-25
**Total Test Files**: 47
**Coverage Target**: >75% overall
