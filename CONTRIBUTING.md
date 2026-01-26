# Contributing to MarkPDFdown

Thank you for your interest in contributing to MarkPDFdown! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Getting Help](#getting-help)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. We expect all participants to:

- **Be respectful**: Treat everyone with respect. Engage in constructive criticism and avoid personal attacks.
- **Be inclusive**: Welcome newcomers and help them get started.
- **Be collaborative**: Work together to achieve the best outcomes for the project.
- **Be professional**: Maintain professional conduct in all interactions.

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Trolling or personal/political attacks
- Publishing others' private information without permission
- Other conduct that could reasonably be considered inappropriate

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with the following information:

1. **Description**: A clear and concise description of the bug
2. **Steps to Reproduce**: Detailed steps to reproduce the behavior
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Screenshots**: If applicable, add screenshots
6. **Environment**:
   - OS: [e.g., Windows 11, macOS 14, Ubuntu 22.04]
   - App Version: [e.g., 1.0.0]
   - Node.js Version: [e.g., 18.17.0]

### Suggesting Features

We welcome feature suggestions! Please create an issue with:

1. **Feature Description**: Clear description of the proposed feature
2. **Use Case**: Why this feature would be useful
3. **Proposed Solution**: If you have ideas on how to implement it
4. **Alternatives Considered**: Any alternative solutions you've considered

### Code Contributions

1. Fork the repository
2. Create a feature branch from `master`
3. Make your changes
4. Write or update tests as needed
5. Ensure all tests pass
6. Submit a pull request

## Development Setup

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

## Development Workflow

### Adding New Features

Follow these steps when adding new features to the project:

#### 1. Database Schema Changes

Create Prisma schema changes in `src/core/infrastructure/db/schema.prisma`:

```bash
# Run migrations in development
npm run migrate:dev

# Generate Prisma client
npm run generate
```

#### 2. Create Repository

Add Repository in `src/core/domain/repositories/`:

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

#### 3. Add Repository Tests

Add tests in `src/core/domain/repositories/__tests__/`:

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

#### 4. Add Application Services (if needed)

Add services in `src/core/application/services/` and corresponding tests in `src/core/application/services/__tests__/`.

#### 5. Create IPC Handler

Add IPC handler in `src/main/ipc/handlers/feature.handler.ts`:

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

#### 6. Register Handler

Register handler in `src/main/ipc/handlers/index.ts`.

#### 7. Add IPC Handler Tests

Add tests in `src/main/ipc/__tests__/handlers.test.ts`:

```typescript
it('should handle feature:action', async () => {
  const mockData = { id: 1, name: 'test' }
  vi.mocked(featureRepository.action).mockResolvedValue(mockData)

  const result = await handlers.get('feature:action')!(null, params)

  expect(result.success).toBe(true)
  expect(result.data).toEqual(mockData)
})
```

#### 8. Add Preload API

Add preload API in `src/preload/index.ts`:

```typescript
feature: {
  action: (params) => ipcRenderer.invoke('feature:action', params)
}
```

#### 9. Update TypeScript Types

Update TypeScript types in `src/renderer/electron.d.ts`.

#### 10. Update Frontend Components

Update React frontend components to use `window.api.feature.action()`.

#### 11. Add Component Tests (if new component)

Add tests in `src/renderer/components/__tests__/`:

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

#### 12. Add i18n Translations (if UI changes)

Add translations in `src/renderer/locales/` for all supported languages.

#### 13. Run Tests and Verification

```bash
# Run unit tests
npm run test:unit

# Run component tests (if applicable)
npm run test:renderer

# Check coverage
npm run test:coverage

# Run linting
npm run lint

# Type checking
npm run typecheck

# Test in development
npm run dev
```

### Testing

This project uses Vitest as the test framework. For detailed testing documentation, see [docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md).

```bash
# Run all tests
npm test

# Run unit tests (main/server)
npm run test:unit

# Run renderer tests (React components)
npm run test:renderer

# Watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Code Style Guidelines

### TypeScript

- **Strict Mode**: Enabled globally - no `any` unless explicitly allowed
- **Module System**: ESM (`type: "module"` in package.json)
- **Module Alias**: 
  - `@` alias available in frontend only
  - Backend uses relative imports with `.js` extensions

### ESLint

- Config file: `eslint.config.js` (flat config format)
- Extends TypeScript-ESLint recommended config
- React hooks enforcement enabled

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (Controllers, DAL, Logic) | PascalCase | `TaskController.ts`, `ProviderDal.ts` |
| Variables/Functions | camelCase | `createTasks`, `getAllTasks` |
| Constants (config) | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Classes/Interfaces | PascalCase | `Task`, `Provider` |
| Database Models | PascalCase singular | `Provider`, `Task`, `Model` |

## Commit Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
type(scope): description
```

- `scope` is optional
- Description should be concise and descriptive

### Commit Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Code style changes (formatting, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |
| `ci` | CI/CD changes |
| `build` | Build system changes |
| `revert` | Revert a previous commit |

### Examples

```bash
feat(auth): add login feature
fix(upload): resolve file size validation issue
docs: update README with new API examples
refactor(worker): simplify task processing logic
test(provider): add unit tests for provider repository
```

### Pre-commit Checks

Always run before committing:

```bash
npm run lint
npm run typecheck
npm test
```

## Pull Request Process

### Before Submitting

1. **Create a branch**: Create a feature branch from `master`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make changes**: Implement your changes following the code style guidelines

3. **Test**: Ensure all tests pass
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

4. **Commit**: Follow the commit guidelines

### Submitting a PR

1. Push your branch to your fork
2. Open a Pull Request against the `master` branch
3. Fill in the PR template with:
   - Description of changes
   - Related issue numbers
   - Screenshots (if applicable)
   - Testing performed

### PR Review Process

1. At least one maintainer review is required
2. All CI checks must pass
3. Address any requested changes
4. Once approved, the PR will be merged

### After Merge

- Delete your feature branch
- Pull the latest `master` to your local repository

## Getting Help

- **Documentation**: Check [docs/](./docs/) for detailed guides
- **Issues**: Search existing issues or create a new one
- **Discussions**: Use GitHub Discussions for questions

---

Thank you for contributing to MarkPDFdown!
