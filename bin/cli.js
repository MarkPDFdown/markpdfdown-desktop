#!/usr/bin/env node

// CLI 模式强制使用生产环境，确保数据库路径正确指向 userData 目录
process.env.NODE_ENV = 'production';
process.env.ELECTRON_IS_DEV = '0';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 确保 Prisma client 存在
async function ensurePrismaClient() {
  const prismaClientPath = join(projectRoot, 'node_modules', '.prisma', 'client', 'index.js');

  if (!existsSync(prismaClientPath)) {
    console.log('🔧 Prisma client not found. Generating...');
    try {
      execSync('npx prisma generate --schema=./src/core/infrastructure/db/schema.prisma', {
        cwd: projectRoot,
        stdio: 'inherit'
      });
      console.log('✅ Prisma client generated successfully.');
    } catch (error) {
      console.error('❌ Failed to generate Prisma client:', error.message);
      process.exit(1);
    }
  }
}

// 启动 Electron
function launchElectron(args) {
  const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  const electronPath = join(projectRoot, 'node_modules', '.bin', electronBin);
  const mainPath = join(projectRoot, 'dist', 'main', 'index.js');

  if (!existsSync(mainPath)) {
    console.error('❌ Application not built. Please run: npm run build');
    process.exit(1);
  }

  const child = spawn(electronPath, [mainPath, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_IS_DEV: '0'
    }
  });

  child.on('error', (err) => {
    console.error('❌ Failed to start Electron:', err.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// 显示版本
function showVersion() {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');
  console.log(`markpdfdown v${pkg.version}`);
}

// 显示帮助
function showHelp() {
  console.log(`
markpdfdown - PDF to Markdown converter powered by LLM vision

Usage:
  npx markpdfdown [command] [options]

Commands:
  gui, start     Launch the desktop application (default)
  version, -v    Show version number
  help, -h       Show this help message

Examples:
  npx markpdfdown              # Launch GUI
  npx markpdfdown --version    # Show version

For more info: https://github.com/markpdfdown/markpdfdown-desktop
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'gui';

  switch (command) {
    case 'gui':
    case 'start':
      await ensurePrismaClient();
      launchElectron(args.slice(1));
      break;

    case 'version':
    case '-v':
    case '--version':
      showVersion();
      break;

    case 'help':
    case '-h':
    case '--help':
      showHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
