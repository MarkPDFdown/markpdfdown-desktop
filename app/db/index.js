import dbClient from './client/index.js';
import { runMigrations } from './migration.js';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
const PrismaClient = dbClient.PrismaClient;

// 设置和获取数据库URL
function getDatabaseUrl() {
    // 否则，为打包应用生成一个默认路径
    if (app) {
        const userDataPath = app.getPath('userData');
        const dbDir = path.join(userDataPath, 'db');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        console.log('Using userData database path:', `file:${path.join(dbDir, 'app.db')}`);
        return `file:${path.join(dbDir, 'app.db')}`;
    }

    // 开发环境回退路径
    console.log('Using default development database path:', 'file:./dev.db');
    return 'file:./dev.db';
}

// 获取数据库URL
const dbUrl = getDatabaseUrl();

// 创建Prisma实例，使用环境变量中的数据库URL
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: dbUrl
        }
    }
});

// 初始化数据库，包括运行迁移
const initDatabase = async () => {
    try {
        console.log(`Initializing database(url:${dbUrl})...`);
        // 验证数据库连接
        await prisma.$queryRaw`SELECT 1`;
        console.log('Database connection established successfully.');

        // 运行迁移，传递现有的prisma实例
        await runMigrations(prisma);

        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        return false;
    }
};

/**
 * 关闭数据库连接
 */
const disconnect = async () => {
    await prisma.$disconnect();
    console.log('Database connection has been closed');
};

export {
    prisma,
    disconnect,
    initDatabase
}; 