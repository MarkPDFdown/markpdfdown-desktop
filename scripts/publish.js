#!/usr/bin/env node

/**
 * Local npm publish script
 *
 * Usage:
 *   npm run publish [version]
 *   npm run publish 0.1.7-beta.1
 *   npm run publish -- --dry-run
 *
 * This script:
 * 1. Backs up package.json
 * 2. Sets version (if provided)
 * 3. Moves electron from devDependencies to optionalDependencies
 * 4. Runs npm publish
 * 5. Restores package.json
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const packageJsonPath = join(projectRoot, 'package.json');
const backupPath = join(projectRoot, 'package.json.backup');
const envPath = join(projectRoot, '.env');
const npmrcPath = join(projectRoot, '.npmrc');
const npmrcBackupPath = join(projectRoot, '.npmrc.backup');

// Load .env file if exists
function loadEnv() {
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// Parse arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const dryRun = args.includes('--dry-run');
const skipBuild = args.includes('--skip-build');
const tagIndex = args.findIndex(arg => arg === '--tag');
const tag = tagIndex !== -1 && args[tagIndex + 1] ? args[tagIndex + 1] : 'beta';
const version = args.find(arg => !arg.startsWith('--') && arg !== tag);

function printHelp() {
  console.log(`
Usage: npm run publish [version] [options]

Arguments:
  version           Version to publish (e.g., 0.1.7-beta.1)
                    MUST contain "-beta" to prevent overwriting production packages
                    If not specified, uses current version from package.json

Options:
  --dry-run         Simulate publish without actually publishing
  --skip-build      Skip the build step (use existing dist/)
  --tag <tag>       npm dist-tag to publish under (default: "beta")
                    Use "beta" to avoid overwriting the "latest" tag
  --help, -h        Show this help message

Environment:
  NPM_TOKEN         Required for publishing (can be set in .env file)

Setup:
  1. Create .env file in project root:
     NPM_TOKEN=npm_xxxxxxxxxxxx

  2. Get your npm token from: https://www.npmjs.com/settings/~/tokens

Examples:
  npm run publish                           # Publish current version
  npm run publish 0.1.7                     # Publish as 0.1.7
  npm run publish 0.1.7-beta.1 --dry-run   # Test publish 0.1.7-beta.1
  npm run publish -- --skip-build          # Publish without rebuilding

This script automatically:
  1. Loads NPM_TOKEN from .env file
  2. Backs up package.json
  3. Moves electron from devDependencies to optionalDependencies
  4. Builds the project (unless --skip-build)
  5. Publishes to npm
  6. Restores package.json
`);
}

function log(message) {
  console.log(`\x1b[36m[publish]\x1b[0m ${message}`);
}

function success(message) {
  console.log(`\x1b[32m[publish]\x1b[0m ${message}`);
}

function error(message) {
  console.error(`\x1b[31m[publish]\x1b[0m ${message}`);
}

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8'));
}

function writePackageJson(pkg) {
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
}

function backup() {
  copyFileSync(packageJsonPath, backupPath);
  log('Backed up package.json');
}

function restore() {
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, packageJsonPath);
    unlinkSync(backupPath);
    log('Restored package.json');
  }
}

function backupNpmrc() {
  if (existsSync(npmrcPath)) {
    copyFileSync(npmrcPath, npmrcBackupPath);
    log('Backed up existing .npmrc');
    return true;
  }
  return false;
}

function restoreNpmrc(hadExisting) {
  if (hadExisting && existsSync(npmrcBackupPath)) {
    copyFileSync(npmrcBackupPath, npmrcPath);
    unlinkSync(npmrcBackupPath);
    log('Restored .npmrc');
  } else if (!hadExisting && existsSync(npmrcPath)) {
    unlinkSync(npmrcPath);
    log('Removed temporary .npmrc');
  }
}

function setupNpmAuth(token) {
  // Create .npmrc with auth token for registry.npmjs.org
  const npmrcContent = `//registry.npmjs.org/:_authToken=${token}\n`;
  writeFileSync(npmrcPath, npmrcContent);
  log('Created .npmrc with auth token');
}

function run(command, options = {}) {
  log(`Running: ${command}`);
  try {
    execSync(command, {
      cwd: projectRoot,
      stdio: 'inherit',
      ...options
    });
  } catch (err) {
    // Check for common npm auth errors
    const output = err.stderr?.toString() || err.stdout?.toString() || '';
    if (output.includes('Access token expired') || output.includes('E401') || output.includes('ENEEDAUTH')) {
      throw new Error('NPM token expired or invalid. Please update NPM_TOKEN in .env file.\n       Get a new token from: https://www.npmjs.com/settings/~/tokens');
    }
    throw new Error(`Command failed: ${command}`);
  }
}

async function main() {
  if (showHelp) {
    printHelp();
    return;
  }

  log('Starting publish process...');

  if (dryRun) {
    log('DRY RUN MODE - will not actually publish');
  }

  // Step 1: Check NPM_TOKEN early
  const npmToken = process.env.NPM_TOKEN;
  if (!dryRun && !npmToken) {
    error('NPM_TOKEN not found. Please set it in .env file or environment variable.');
    process.exitCode = 1;
    return;
  }

  // Step 1.5: Validate version contains "-beta" to prevent overwriting production packages
  const currentPkg = readPackageJson();
  const publishVersion = version || currentPkg.version;
  if (!publishVersion.includes('-beta')) {
    error(`Version "${publishVersion}" must contain "-beta" for local publishing.`);
    error('This prevents accidentally overwriting production packages.');
    error('Example: npm run publish 0.1.7-beta.1');
    process.exitCode = 1;
    return;
  }

  // Step 2: Backup package.json and .npmrc
  backup();
  const hadExistingNpmrc = backupNpmrc();

  try {
    // Step 3: Read and modify package.json
    const pkg = readPackageJson();

    // Set version if provided
    if (version) {
      pkg.version = version;
      log(`Set version to: ${version}`);
    } else {
      log(`Using current version: ${pkg.version}`);
    }

    // Get electron version from devDependencies
    const electronVersion = pkg.devDependencies?.electron;
    if (!electronVersion) {
      throw new Error('electron not found in devDependencies');
    }
    log(`Found electron@${electronVersion} in devDependencies`);

    // Move electron to optionalDependencies
    if (!pkg.optionalDependencies) {
      pkg.optionalDependencies = {};
    }
    pkg.optionalDependencies.electron = electronVersion;
    delete pkg.devDependencies.electron;
    log('Moved electron to optionalDependencies');

    // Write modified package.json
    writePackageJson(pkg);
    success('Updated package.json for publishing');

    // Step 4: Build (skip if --skip-build)
    if (skipBuild) {
      log('Skipping build (--skip-build)');
    } else {
      log('Building project...');
      run('npm run build');
    }

    // Step 5: Setup npm authentication via .npmrc
    if (npmToken) {
      setupNpmAuth(npmToken);
    }

    // Step 6: Publish (use --ignore-scripts to avoid recursive publish script call)
    // Use --tag to avoid overwriting 'latest' tag (default: beta)
    if (dryRun) {
      log(`Dry run: npm publish --dry-run --access public --tag ${tag}`);
      run(`npm publish --dry-run --access public --tag ${tag} --ignore-scripts`);
    } else {
      log(`Publishing to npm with tag "${tag}"...`);
      run(`npm publish --access public --tag ${tag} --ignore-scripts`);
    }

    success(`Successfully published markpdfdown@${pkg.version}${dryRun ? ' (dry run)' : ''}`);

  } catch (err) {
    error(err.message);
    process.exitCode = 1;
  } finally {
    // Always restore package.json and .npmrc
    restore();
    restoreNpmrc(hadExistingNpmrc);
  }
}

main();
