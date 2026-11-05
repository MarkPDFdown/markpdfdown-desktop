import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { runMigrations } from "./Migration.js";
import path from "path";
import { app } from "electron";
import fs from "fs";
import isDev from "electron-is-dev";

/**
 * databasePath is set when the database file is what's failing, so that rebuilding it can help.
 * It isn't when Prisma can't even run a query: without an engine, a new file would fail as well.
 */
type DatabaseInitResult =
  | { success: true }
  | { success: false; error: string; databasePath?: string };

// 懒加载的 Prisma 实例和数据库 URL
let prismaInstance: InstanceType<typeof PrismaClient> | null = null;
let cachedDbPath: string | null = null;
let initResult: Promise<DatabaseInitResult> | null = null;

// 设置和获取数据库文件路径（懒加载，确保 app.setName 已执行）
function getDatabasePath(): string {
  if (cachedDbPath) {
    return cachedDbPath;
  }

  // 否则，为打包应用生成一个默认路径
  if (!isDev) {
    const userDataPath = app.getPath("userData");
    const dbDir = path.join(userDataPath, "db");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    cachedDbPath = path.join(dbDir, "app.db");
    console.log("Using userData database path:", cachedDbPath);
    return cachedDbPath;
  }

  // 开发环境回退路径
  cachedDbPath = path.join(process.cwd(), "src", "core", "infrastructure", "db", "dev.db");
  console.log("Using default development database path:", cachedDbPath);
  return cachedDbPath;
}

// 获取 Prisma 实例（懒加载）
function getPrismaClient(): InstanceType<typeof PrismaClient> {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: `file:${getDatabasePath()}`,
        },
      },
    });
  }
  return prismaInstance;
}

// 导出 prisma 的 getter，确保懒加载
const prisma = new Proxy({} as InstanceType<typeof PrismaClient>, {
  get(_target, prop) {
    return Reflect.get(getPrismaClient(), prop);
  },
});

const connectAndMigrate = async (): Promise<DatabaseInitResult> => {
  let rebuildableDatabasePath: string | undefined;
  try {
    const dbPath = getDatabasePath();
    const client = getPrismaClient();
    console.log(`Initializing database(path:${dbPath})...`);
    // 验证数据库连接
    await client.$queryRaw`SELECT 1`;
    console.log("Database connection established successfully.");
    rebuildableDatabasePath = dbPath;

    // 运行迁移，传递现有的prisma实例
    await runMigrations(client);

    return { success: true };
  } catch (error) {
    console.error("Database initialization error:", error);
    // Prisma 的错误信息首尾带空行
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)).trim(),
      databasePath: rebuildableDatabasePath,
    };
  }
};

/**
 * 初始化数据库，包括运行迁移。只执行一次，重复调用得到同一个结果，
 * 所以渲染进程无论何时加载，都能等到并拿到这次初始化的结果。
 */
const initDatabase = (): Promise<DatabaseInitResult> => {
  initResult ??= connectAndMigrate();
  return initResult;
};

/**
 * 关闭数据库连接
 */
const disconnect = async (): Promise<void> => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    cachedDbPath = null;
    initResult = null;
    console.log("Database connection has been closed");
  }
};

export { prisma, disconnect, initDatabase };
export type { DatabaseInitResult };
