# MarkPDFdown

[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [فارسی](./README.fa.md)

大規模言語モデル（LLM）の視覚認識機能を使用して、PDFドキュメントをMarkdown形式に変換するデスクトップアプリケーションです。

## 機能

- **マルチLLMサポート**：OpenAI、Anthropic Claude、Google Gemini、Ollama（ローカルモデル）、OpenAI Responses API
- **高品質変換**：LLMのビジョン機能を活用した正確なPDFからMarkdownへの変換
- **並列プレビュー**：元のPDFページと生成されたMarkdownを並べて表示
- **数式・コードサポート**：LaTeX数式（KaTeX）とシンタックスハイライト付きコードブロックの完全サポート
- **多言語UI**：英語、中国語、日本語、ロシア語、アラビア語、ペルシア語
- **並列処理**：高速変換のための設定可能なワーカーインスタンス
- **進捗追跡**：リアルタイムのステータス更新とページごとのリトライサポート
- **ローカルストレージ**：タスク永続化のためのSQLiteデータベース

## スクリーンショット

<img width="1264" height="848" alt="1769311168213_download" src="https://github.com/user-attachments/assets/15b5a801-6729-492a-a979-1fc4dba6853a" />

## インストール

### クイックスタート（推奨）

npxで直接実行（Node.js 18+が必要）：

```bash
npx -y markpdfdown
```

### インストーラーのダウンロード

[Releases](https://github.com/MarkPDFdown/markpdfdown-desktop/releases)ページからお使いのプラットフォーム用の最新版をダウンロードしてください：

- **Windows**：`MarkPDFdown-{version}-x64.exe`
- **macOS**：`MarkPDFdown-{version}-arm64.dmg` / `MarkPDFdown-{version}-x64.dmg`
- **Linux**：`MarkPDFdown-{version}-x86_64.AppImage`

## 使い方

1. **プロバイダーの設定**：設定画面でLLMプロバイダーの認証情報（APIキー、ベースURL）を追加
2. **モデルの追加**：変換に使用するモデルを設定
3. **PDFのアップロード**：ドラッグ＆ドロップまたはクリックしてPDFファイルを選択
4. **モデルの選択**：変換に使用するLLMモデルを選択
5. **変換**：変換プロセスを開始
6. **プレビュー**：並列比較で結果をページごとに表示
7. **ダウンロード**：結合されたMarkdownファイルをエクスポート

## 開発

### 前提条件

- Node.js 18+
- npm 8+

### セットアップ

```bash
# 依存関係のインストール
npm install

# Prismaクライアントの生成
npm run generate

# データベースマイグレーションの実行
npm run migrate:dev

# 開発サーバーの起動
npm run dev
```

### ビルド

```bash
# プロダクションビルド
npm run build

# プラットフォーム別インストーラー
npm run build:win    # Windows NSISインストーラー
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

### テスト

```bash
npm test              # 全テストを実行
npm run test:unit     # ユニットテストのみ
npm run test:renderer # コンポーネントテストのみ
npm run test:coverage # カバレッジレポートを生成
```

### プロジェクト構造

```
src/
├── main/                 # Electronメインプロセス
│   ├── index.ts         # アプリエントリー、ウィンドウ作成、IPCセットアップ
│   └── ipc/             # IPCハンドラー
├── preload/             # プリロードスクリプト（window.api）
├── renderer/            # Reactフロントエンド
│   ├── components/      # UIコンポーネント
│   ├── pages/           # ルートページ
│   └── locales/         # i18n翻訳
├── core/                # ビジネスロジック（クリーンアーキテクチャ）
│   ├── infrastructure/  # データベース、外部サービス
│   ├── application/     # ワーカー、オーケストレーション
│   ├── domain/          # インターフェース、ドメイン型
│   └── shared/          # イベントバス、ユーティリティ
└── shared/              # メイン/レンダラー間の共有型
```

## 技術スタック

- **フレームワーク**：Electron 35 + React 18 + TypeScript
- **ビルドツール**：Vite 6
- **UI**：Ant Design 5
- **データベース**：Prisma ORM + SQLite
- **PDF処理**：pdf-lib、pdf-to-png-converter、Sharp
- **Markdown**：react-markdown、remark-gfm、remark-math、rehype-katex、rehype-prism-plus
- **テスト**：Vitest + Testing Library

## 対応LLMプロバイダー

| プロバイダー | モデル | 備考 |
|-------------|--------|------|
| OpenAI | GPT-4o、GPT-4-turboなど | APIキーが必要 |
| Anthropic | Claude 3.5、Claude 3など | APIキーが必要 |
| Google Gemini | Gemini Pro、Gemini Flashなど | APIキーが必要 |
| Ollama | LLaVA、Llama 3.2 Visionなど | ローカル実行、APIキー不要 |
| OpenAI Responses | OpenAI互換モデル | カスタムエンドポイントサポート |

## ライセンス

[Apache-2.0](./LICENSE)

## コントリビューション

コントリビューションを歓迎します！開発ガイドラインについては[AGENTS.md](./AGENTS.md)ファイルをお読みください。
