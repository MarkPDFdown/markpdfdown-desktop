import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { queryRaw, disconnectClient, runMigrations } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  disconnectClient: vi.fn(),
  runMigrations: vi.fn()
}))

vi.mock('@prisma/client', () => ({
  default: {
    PrismaClient: class {
      $queryRaw = queryRaw
      $disconnect = disconnectClient
    }
  }
}))
vi.mock('../Migration.js', () => ({ runMigrations }))
vi.mock('electron-is-dev', () => ({ default: true }))

import { disconnect, initDatabase } from '../index.js'

describe('initDatabase', () => {
  beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([])
    runMigrations.mockReset().mockResolvedValue(undefined)
    disconnectClient.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await disconnect()
    vi.restoreAllMocks()
  })

  it('reports success once connected and migrated', async () => {
    await expect(initDatabase()).resolves.toEqual({ success: true })
    expect(runMigrations).toHaveBeenCalledTimes(1)
  })

  it('reports why the engine could not be loaded', async () => {
    queryRaw.mockRejectedValue(new Error('\nPrisma Client could not locate the Query Engine\n'))

    await expect(initDatabase()).resolves.toEqual({
      success: false,
      error: 'Prisma Client could not locate the Query Engine'
    })
    expect(runMigrations).not.toHaveBeenCalled()
  })

  it('reports a failed migration', async () => {
    runMigrations.mockRejectedValue(new Error('no such table'))

    await expect(initDatabase()).resolves.toEqual({ success: false, error: 'no such table' })
  })

  it('initializes once however many callers ask, so a late caller gets the same outcome', async () => {
    queryRaw.mockRejectedValue(new Error('boom'))

    const [first, second] = await Promise.all([initDatabase(), initDatabase()])
    const late = await initDatabase()

    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ success: false, error: 'boom' })
    expect(second).toEqual(first)
    expect(late).toEqual(first)
  })

  it('initializes again after a disconnect', async () => {
    await initDatabase()
    await disconnect()
    await initDatabase()

    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})
