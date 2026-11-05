import { PrismaClient } from '@prisma/client';

export const prisma: PrismaClient;
export type DatabaseInitResult = { success: true } | { success: false; error: string; databasePath?: string };
export function initDatabase(): Promise<DatabaseInitResult>;
export function disconnect(): Promise<void>; 