import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { runMigrations } from '../Migration.js'

/**
 * Runs the migration through the real runner against a real SQLite file, so the
 * runner's statement splitting and the table/column names are exercised too.
 */
const MIGRATION_NAME = '20261104000000_ollama_chat_suffix'

describe(`migration ${MIGRATION_NAME}`, () => {
  let dir: string
  let prisma: PrismaClient

  const seed = (name: string, type: string, suffix: string | null) =>
    prisma.provider.create({ data: { name, type, suffix, base_url: 'http://localhost:11434/api' } })

  const suffixOf = async (name: string) =>
    (await prisma.provider.findFirstOrThrow({ where: { name } })).suffix

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    dir = mkdtempSync(path.join(tmpdir(), 'mpd-migration-'))
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } }
    })

    // Bring the schema up to date, seed rows as an older version saved them,
    // then replay this migration the way an upgrade would.
    await runMigrations(prisma)
    await seed('legacy-default', 'ollama', '/generate')
    await seed('legacy-api-prefixed', 'ollama', '/api/generate')
    await seed('already-chat', 'ollama', '/chat')
    await seed('already-api-chat', 'ollama', '/api/chat')
    await seed('unset-empty', 'ollama', '')
    await seed('unset-null', 'ollama', null)
    await seed('custom', 'ollama', '/custom/generate')
    await seed('other-provider', 'openai', '/generate')
    await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${MIGRATION_NAME}`
    await runMigrations(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  })

  it('moves saved /generate suffixes of Ollama providers to the chat endpoint', async () => {
    expect(await suffixOf('legacy-default')).toBe('/chat')
    expect(await suffixOf('legacy-api-prefixed')).toBe('/api/chat')
  })

  it('leaves working and unset Ollama suffixes alone', async () => {
    expect(await suffixOf('already-chat')).toBe('/chat')
    expect(await suffixOf('already-api-chat')).toBe('/api/chat')
    expect(await suffixOf('unset-empty')).toBe('')
    expect(await suffixOf('unset-null')).toBeNull()
  })

  it('leaves custom suffixes and other providers alone', async () => {
    expect(await suffixOf('custom')).toBe('/custom/generate')
    expect(await suffixOf('other-provider')).toBe('/generate')
  })
})
