# MarkPDFdown

[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [فارسی](./README.fa.md)

一款使用大语言模型（LLM）视觉识别功能将 PDF 文档转换为 Markdown 格式的桌面应用程序。

## 功能特性

- **多 LLM 支持**：OpenAI、Anthropic Claude、Google Gemini、Ollama（本地模型）和 OpenAI Responses API
- **高质量转换**：利用 LLM 视觉能力实现精准的 PDF 到 Markdown 转换
- **并排预览**：同时查看原始 PDF 页面和生成的 Markdown
- **数学公式和代码支持**：完整支持 LaTeX 公式（KaTeX）和语法高亮代码块
- **多语言界面**：英语、中文、日语、俄语、阿拉伯语和波斯语
- **并行处理**：可配置工作线程数以加快转换速度
- **进度追踪**：实时状态更新和单页重试支持
- **本地存储**：使用 SQLite 数据库持久化任务

## 截图

<img width="1264" height="848" alt="1769311168213_download" src="https://github.com/user-attachments/assets/15b5a801-6729-492a-a979-1fc4dba6853a" />

## 安装

### 快速开始（推荐）

使用 npx 直接运行（需要 Node.js 18+）：

```bash
npx -y markpdfdown
```

### 下载安装包

从 [Releases](https://github.com/MarkPDFdown/markpdfdown-desktop/releases) 页面下载适合您平台的最新版本：

- **Windows**：`MarkPDFdown-{version}-x64.exe`
- **macOS**：`MarkPDFdown-{version}-arm64.dmg` / `MarkPDFdown-{version}-x64.dmg`
- **Linux**：`MarkPDFdown-{version}-x86_64.AppImage`

## 使用方法

1. **配置提供商**：进入设置，添加您的 LLM 提供商凭据（API 密钥、基础 URL）
2. **添加模型**：配置您想要用于转换的模型
3. **上传 PDF**：拖放或点击选择 PDF 文件
4. **选择模型**：选择用于转换的 LLM 模型
5. **转换**：开始转换过程
6. **预览**：逐页查看结果，支持并排对比
7. **下载**：导出合并后的 Markdown 文件

## 开发

### 前置要求

- Node.js 18+
- npm 8+

### 设置

```bash
# 安装依赖
npm install

# 生成 Prisma 客户端
npm run generate

# 运行数据库迁移
npm run migrate:dev

# 启动开发服务器
npm run dev
```

### 构建

```bash
# 生产构建
npm run build

# 平台特定安装包
npm run build:win    # Windows NSIS 安装程序
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

### 测试

```bash
npm test              # 运行所有测试
npm run test:unit     # 仅单元测试
npm run test:renderer # 仅组件测试
npm run test:coverage # 生成覆盖率报告
```

### 项目结构

```
src/
├── main/                 # Electron 主进程
│   ├── index.ts         # 应用入口、窗口创建、IPC 设置
│   └── ipc/             # IPC 处理器
├── preload/             # 预加载脚本（window.api）
├── renderer/            # React 前端
│   ├── components/      # UI 组件
│   ├── pages/           # 路由页面
│   └── locales/         # 国际化翻译
├── core/                # 业务逻辑（整洁架构）
│   ├── infrastructure/  # 数据库、外部服务
│   ├── application/     # 工作线程、编排
│   ├── domain/          # 接口、领域类型
│   └── shared/          # 事件总线、工具函数
└── shared/              # 主进程/渲染进程共享类型
```

## 技术栈

- **框架**：Electron 35 + React 18 + TypeScript
- **构建工具**：Vite 6
- **UI**：Ant Design 5
- **数据库**：Prisma ORM + SQLite
- **PDF 处理**：pdf-lib、pdf-to-png-converter、Sharp
- **Markdown**：react-markdown、remark-gfm、remark-math、rehype-katex、rehype-prism-plus
- **测试**：Vitest + Testing Library

## 支持的 LLM 提供商

| 提供商 | 模型 | 备注 |
|--------|------|------|
| OpenAI | GPT-4o、GPT-4-turbo 等 | 需要 API 密钥 |
| Anthropic | Claude 3.5、Claude 3 等 | 需要 API 密钥 |
| Google Gemini | Gemini Pro、Gemini Flash 等 | 需要 API 密钥 |
| Ollama | LLaVA、Llama 3.2 Vision 等 | 本地运行，无需 API 密钥 |
| OpenAI Responses | 任何 OpenAI 兼容模型 | 支持自定义端点 |

## 许可证

[Apache-2.0](./LICENSE)

## 贡献

欢迎贡献！请阅读 [AGENTS.md](./AGENTS.md) 文件了解开发指南。
