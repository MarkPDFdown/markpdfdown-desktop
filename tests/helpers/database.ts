import { PrismaClient } from '@prisma/client'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'

export type MockPrismaClient = DeepMockProxy<PrismaClient>

export const createMockPrismaClient = (): MockPrismaClient => {
  return mockDeep<PrismaClient>()
}

export const resetMockPrismaClient = (prisma: MockPrismaClient): void => {
  mockReset(prisma)
}
