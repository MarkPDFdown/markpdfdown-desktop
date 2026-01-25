# MarkPDFdown

[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [فارسی](./README.fa.md)

A desktop application that converts PDF documents to Markdown format using Large Language Model (LLM) visual recognition.

## Features

- **Multi-LLM Support**: OpenAI, Anthropic Claude, Google Gemini, Ollama (local models), and OpenAI Responses API
- **High-Quality Conversion**: Leverages LLM vision capabilities for accurate PDF to Markdown conversion
- **Side-by-Side Preview**: View original PDF pages alongside generated Markdown
- **Math & Code Support**: Full support for LaTeX equations (KaTeX) and syntax-highlighted code blocks
- **Multi-Language UI**: English, Chinese, Japanese, Russian, Arabic, and Persian
- **Parallel Processing**: Configurable worker instances for faster conversion
- **Progress Tracking**: Real-time status updates and per-page retry support
- **Local Storage**: SQLite database for task persistence

## Screenshots

<img width="1264" height="848" alt="1769311168213_download" src="https://github.com/user-attachments/assets/15b5a801-6729-492a-a979-1fc4dba6853a" />

## Installation

### Quick Start (Recommended)

Run directly with npx (requires Node.js 18+):

```bash
npx markpdfdown
```

### Download Installer

Download the latest release for your platform from the [Releases](https://github.com/MarkPDFdown/desktop/releases) page:

- **Windows**: `MarkPDFdown-{version}-x64.exe`
- **macOS**: `MarkPDFdown-{version}-arm64.dmg` / `MarkPDFdown-{version}-x64.dmg`
- **Linux**: `MarkPDFdown-{version}-x86_64.AppImage`

## Usage

1. **Configure Provider**: Go to Settings and add your LLM provider credentials (API key, base URL)
2. **Add Model**: Configure the model you want to use for conversion
3. **Upload PDF**: Drag and drop or click to select a PDF file
4. **Select Model**: Choose the LLM model for conversion
5. **Convert**: Start the conversion process
6. **Preview**: View the results page by page with side-by-side comparison
7. **Download**: Export the merged Markdown file

## Development

### Prerequisites

- Node.js 18+
- npm 8+

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run generate

# Run database migrations
npm run migrate:dev

# Start development server
npm run dev
```

### Build

```bash
# Production build
npm run build

# Platform-specific installers
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

### Testing

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:renderer # Component tests only
npm run test:coverage # Generate coverage report
```

### Project Structure

```
src/
├── main/                 # Electron main process
│   ├── index.ts         # App entry, window creation, IPC setup
│   └── ipc/             # IPC handlers
├── preload/             # Preload scripts (window.api)
├── renderer/            # React frontend
│   ├── components/      # UI components
│   ├── pages/           # Route pages
│   └── locales/         # i18n translations
├── core/                # Business logic (Clean Architecture)
│   ├── infrastructure/  # Database, external services
│   ├── application/     # Workers, orchestration
│   ├── domain/          # Interfaces, domain types
│   └── shared/          # Event bus, utilities
└── shared/              # Shared types between main/renderer
```

## Tech Stack

- **Framework**: Electron 35 + React 18 + TypeScript
- **Build Tool**: Vite 6
- **UI**: Ant Design 5
- **Database**: Prisma ORM + SQLite
- **PDF Processing**: pdf-lib, pdf-to-png-converter, Sharp
- **Markdown**: react-markdown, remark-gfm, remark-math, rehype-katex, rehype-prism-plus
- **Testing**: Vitest + Testing Library

## Supported LLM Providers

| Provider | Models | Notes |
|----------|--------|-------|
| OpenAI | GPT-4o, GPT-4-turbo, etc. | Requires API key |
| Anthropic | Claude 3.5, Claude 3, etc. | Requires API key |
| Google Gemini | Gemini Pro, Gemini Flash, etc. | Requires API key |
| Ollama | LLaVA, Llama 3.2 Vision, etc. | Local, no API key needed |
| OpenAI Responses | Any OpenAI-compatible model | Custom endpoint support |

## License

[Apache-2.0](./LICENSE)

## Contributing

Contributions are welcome! Please read the [AGENTS.md](./AGENTS.md) file for development guidelines.
