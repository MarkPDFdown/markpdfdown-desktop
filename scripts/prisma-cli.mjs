#!/usr/bin/env node

/**
 * Runs the Prisma CLI with the `binaryTargets` of this host, which schema.prisma reads from
 * PRISMA_BINARY_TARGETS. Packages are built on a runner of their target arch, so the host decides.
 *
 * Usage: node scripts/prisma-cli.mjs generate --schema=./src/core/infrastructure/db/schema.prisma
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaryTargetsForHost } from './prisma-engines.mjs';

const PRISMA_CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'prisma', 'build', 'index.js');

const result = spawnSync(process.execPath, [PRISMA_CLI, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PRISMA_BINARY_TARGETS: JSON.stringify(binaryTargetsForHost(process.platform, process.arch)),
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
