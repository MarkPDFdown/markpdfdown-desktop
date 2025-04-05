const { PrismaClient } = require('@prisma/client');
const { runMigrations } = require('./migrationManager');

// 数据库URL
let dbUrl = process.env.DATABASE_URL;

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
    
    // 运行迁移
    await runMigrations(dbUrl);
    
    // 验证数据库连接
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection established successfully.');
    
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

module.exports = {
  prisma,
  disconnect,
  initDatabase
}; 