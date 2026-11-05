import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { runMigrations } from '../Migration.js'

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'core', 'infrastructure', 'db', 'migrations')

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

  describe('databases that fail every time, so that restarting does not help', () => {
    it('fails on a database left half migrated by an older version, again on a retry', async () => {
      await runMigrations(prisma)
      const applied = await appliedMigrations()
      const rebuildsTask = applied.findLast((name) =>
        readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8').includes('"new_Task"')
      )
      // What rebuilding the table left behind when it stopped between its DROP and its RENAME.
      await prisma.$executeRawUnsafe('ALTER TABLE "Task" RENAME TO "new_Task"')
      await prisma.$executeRawUnsafe(
        `DELETE FROM _prisma_migrations WHERE migration_name >= '${rebuildsTask}'`
      )

      await expect(runMigrations(prisma)).rejects.toThrow(`Failed to apply migration ${rebuildsTask}`)
      await expect(runMigrations(prisma)).rejects.toThrow(`Failed to apply migration ${rebuildsTask}`)
    })

    it('fails on an intact database that lost the record of a migration', async () => {
      await runMigrations(prisma)
      const [first] = await appliedMigrations()
      await prisma.$executeRawUnsafe(`DELETE FROM _prisma_migrations WHERE migration_name = '${first}'`)

      await expect(runMigrations(prisma)).rejects.toThrow(`Failed to apply migration ${first}`)
    })
  })
})
