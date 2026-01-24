import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { runMigrations } from "./Migration.js";
import path from "path";
import { app } from "electron";
import fs from "fs";
import isDev from "electron-is-dev";

// 懒加载的 Prisma 实例和数据库 URL
let prismaInstance: InstanceType<typeof PrismaClient> | null = null;
let cachedDbUrl: string | null = null;

// 设置和获取数据库URL（懒加载，确保 app.setName 已执行）
function getDatabaseUrl(): string {
  if (cachedDbUrl) {
    return cachedDbUrl;
  }

  // 否则，为打包应用生成一个默认路径
  if (!isDev) {
    const userDataPath = app.getPath("userData");
    const dbDir = path.join(userDataPath, "db");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    cachedDbUrl = `file:${path.join(dbDir, "app.db")}`;
    console.log("Using userData database path:", cachedDbUrl);
    return cachedDbUrl;
  }

  // 开发环境回退路径
  cachedDbUrl = `file:${path.join(process.cwd(), "src", "core", "infrastructure", "db", "dev.db")}`;
  console.log("Using default development database path:", cachedDbUrl);
  return cachedDbUrl;
}

// 获取 Prisma 实例（懒加载）
function getPrismaClient(): InstanceType<typeof PrismaClient> {
  if (!prismaInstance) {
    const dbUrl = getDatabaseUrl();
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
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

// 初始化数据库，包括运行迁移
const initDatabase = async (): Promise<boolean> => {
  try {
    const dbUrl = getDatabaseUrl();
    const client = getPrismaClient();
    console.log(`Initializing database(url:${dbUrl})...`);
    // 验证数据库连接
    await client.$queryRaw`SELECT 1`;
    console.log("Database connection established successfully.");

    // 运行迁移，传递现有的prisma实例
    await runMigrations(client);

    return true;
  } catch (error) {
    console.error("Database initialization error:", error);
    return false;
  }
};

/**
 * 关闭数据库连接
 */
const disconnect = async (): Promise<void> => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    cachedDbUrl = null;
    console.log("Database connection has been closed");
  }
};

export { prisma, disconnect, initDatabase };
