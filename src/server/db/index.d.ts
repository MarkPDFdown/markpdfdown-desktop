import { PrismaClient } from '@prisma/client';

export const prisma: PrismaClient;
export function initDatabase(): Promise<void>;
export function disconnect(): Promise<void>; 