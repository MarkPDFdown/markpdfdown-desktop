import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { runMigrations } from '../Migration.js'

/** Runs against a real SQLite file: what matters is how the runner reacts to real SQL errors. */
describe('runMigrations', () => {
  let dir: string
  let prisma: PrismaClient

  const appliedMigrations = async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations ORDER BY migration_name`
    return rows.map((row) => row.migration_name)
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    dir = mkdtempSync(path.join(tmpdir(), 'mpd-migration-runner-'))
    prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } } })
  })

  afterEach(async () => {
    await prisma.$disconnect()
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('applies everything on a new database, and nothing the second time', async () => {
    await runMigrations(prisma)
    const applied = await appliedMigrations()

    expect(applied.length).toBeGreaterThan(0)
    await expect(runMigrations(prisma)).resolves.toBeUndefined()
    expect(await appliedMigrations()).toEqual(applied)
  })

  it('fails naming the migration, stops there and leaves none of it behind', async () => {
    // The first migration creates Provider and then this table, so it fails halfway through.
    await prisma.$executeRawUnsafe('CREATE TABLE "Model" ("id" INTEGER)')

    await expect(runMigrations(prisma)).rejects.toThrow(/Failed to apply migration 20250414154412_: .*Model/s)

    expect(await appliedMigrations()).toEqual([])
    const provider = await prisma.$queryRaw<unknown[]>`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Provider'`
    expect(provider).toEqual([])
  })
})
