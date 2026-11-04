import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { runMigrations } from '../Migration.js'

/**
 * Runs the migrations through the real runner against a real SQLite file, so the
 * runner's statement splitting and the table/column names are exercised too.
 */
const GENERATE_MIGRATION = '20261104000000_ollama_chat_suffix'
const API_CHAT_MIGRATION = '20261104000001_ollama_api_chat_suffix'

const HOST = 'http://localhost:11434'
const API_BASE = `${HOST}/api`

describe('Ollama suffix migrations', () => {
  let dir: string
  let prisma: PrismaClient

  const seed = (name: string, type: string, suffix: string | null, base_url: string | null = API_BASE) =>
    prisma.provider.create({ data: { name, type, suffix, base_url } })

  const configOf = async (name: string) => {
    const { base_url, suffix } = await prisma.provider.findFirstOrThrow({ where: { name } })
    return { base_url, suffix }
  }

  const replay = async (...migrations: string[]) => {
    for (const migration of migrations) {
      await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${migration}`
    }
    await runMigrations(prisma)
  }

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    dir = mkdtempSync(path.join(tmpdir(), 'mpd-migration-'))
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } }
    })

    // Bring the schema up to date, seed rows as older versions saved them,
    // then replay the migrations the way an upgrade would.
    await runMigrations(prisma)
    await seed('legacy-default', 'ollama', '/generate')
    await seed('legacy-api-prefixed', 'ollama', '/api/generate')
    await seed('legacy-api-prefixed-on-host', 'ollama', '/api/generate', HOST)
    await seed('already-chat', 'ollama', '/chat')
    await seed('api-chat', 'ollama', '/api/chat')
    await seed('api-chat-trailing-slash', 'ollama', '/api/chat', `${API_BASE}/`)
    await seed('api-chat-null-base', 'ollama', '/api/chat', null)
    await seed('api-chat-empty-base', 'ollama', '/api/chat', '')
    await seed('api-chat-on-host', 'ollama', '/api/chat', HOST)
    await seed('api-chat-on-host-trailing-slash', 'ollama', '/api/chat', `${HOST}/`)
    await seed('api-chat-behind-proxy', 'ollama', '/api/chat', 'https://proxy.test/ollama')
    await seed('unset-empty', 'ollama', '')
    await seed('unset-null', 'ollama', null)
    await seed('custom', 'ollama', '/custom/generate')
    await seed('other-provider', 'openai', '/generate')
    await seed('other-provider-api-chat', 'openai', '/api/chat', HOST)
    await replay(GENERATE_MIGRATION, API_CHAT_MIGRATION)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  })

  it('moves saved /generate suffixes of Ollama providers to the chat endpoint', async () => {
    const expected = { base_url: API_BASE, suffix: '/chat' }

    expect(await configOf('legacy-default')).toEqual(expected)
    expect(await configOf('legacy-api-prefixed')).toEqual(expected)
    expect(await configOf('legacy-api-prefixed-on-host')).toEqual(expected)
  })

  it.each([
    { name: 'api-chat', expected: { base_url: API_BASE, suffix: '/chat' } },
    { name: 'api-chat-trailing-slash', expected: { base_url: API_BASE, suffix: '/chat' } },
    { name: 'api-chat-null-base', expected: { base_url: null, suffix: '/chat' } },
    { name: 'api-chat-empty-base', expected: { base_url: '', suffix: '/chat' } }
  ])('drops the duplicate /api from $name', async ({ name, expected }) => {
    expect(await configOf(name)).toEqual(expected)
  })

  it.each([
    { name: 'api-chat-on-host', expected: { base_url: API_BASE, suffix: '/chat' } },
    { name: 'api-chat-on-host-trailing-slash', expected: { base_url: API_BASE, suffix: '/chat' } },
    { name: 'api-chat-behind-proxy', expected: { base_url: 'https://proxy.test/ollama/api', suffix: '/chat' } }
  ])('moves /api into the base for $name, which keeps the endpoint and fixes /tags', async ({ name, expected }) => {
    expect(await configOf(name)).toEqual(expected)
  })

  it('leaves no Ollama provider on a /api/api endpoint', async () => {
    const providers = await prisma.provider.findMany({ where: { type: 'ollama' } })

    // The same fallbacks as ModelService.getLLMClient
    const endpoints = providers.map(({ base_url, suffix }) => `${base_url || API_BASE}${suffix || '/chat'}`)

    expect(endpoints).toContain(`${API_BASE}/chat`)
    expect(endpoints.filter((endpoint) => endpoint.includes('/api/api'))).toEqual([])
    expect(providers.filter(({ suffix }) => suffix === '/api/chat')).toEqual([])
  })

  it('leaves working and unset Ollama suffixes alone', async () => {
    expect(await configOf('already-chat')).toEqual({ base_url: API_BASE, suffix: '/chat' })
    expect(await configOf('unset-empty')).toEqual({ base_url: API_BASE, suffix: '' })
    expect(await configOf('unset-null')).toEqual({ base_url: API_BASE, suffix: null })
  })

  it('leaves custom suffixes and other providers alone', async () => {
    expect(await configOf('custom')).toEqual({ base_url: API_BASE, suffix: '/custom/generate' })
    expect(await configOf('other-provider')).toEqual({ base_url: API_BASE, suffix: '/generate' })
    expect(await configOf('other-provider-api-chat')).toEqual({ base_url: HOST, suffix: '/api/chat' })
  })

  // The runner has no transaction: a failed migration runs again from its first statement
  it('gives the same result when the /api/chat migration runs again', async () => {
    const before = await prisma.provider.findMany({ orderBy: { id: 'asc' } })

    await replay(API_CHAT_MIGRATION)

    expect(await prisma.provider.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
  })
})
