import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import isDev from 'electron-is-dev';
import { app } from 'electron';

// 获取迁移文件目录
const getMigrationsDir = () => {
  // 在开发环境使用项目目录
  if (isDev) {
    return path.join(process.cwd(), 'app', 'db', 'migrations');
  }
  
  // 在打包环境中，确保使用正确的路径
  // 使用app.getAppPath()获取应用根目录
  if (app) {
    return path.join(app.getAppPath(), 'app', 'db', 'migrations');
  }
  
  // 回退到__dirname相对路径
  return path.join(__dirname, 'migrations');
};

// 创建 _prisma_migrations 表的SQL
const createMigrationsTableSQL = `
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                    VARCHAR(36) PRIMARY KEY NOT NULL,
  checksum              VARCHAR(64) NOT NULL,
  finished_at           DATETIME,
  migration_name        VARCHAR(255) NOT NULL,
  logs                  TEXT,
  rolled_back_at        DATETIME,
  started_at            DATETIME NOT NULL DEFAULT current_timestamp,
  applied_steps_count   INTEGER UNSIGNED NOT NULL DEFAULT 0
);
`;

// 检查迁移是否已应用
const isMigrationApplied = async (prisma, migrationName) => {
  try {
    // 检查 _prisma_migrations 表是否存在
    const tableExists = await prisma.$queryRaw`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='_prisma_migrations';
    `;
    
    if (!tableExists || tableExists.length === 0) {
      return false;
    }
    
    // 检查特定迁移是否已应用
    const migration = await prisma.$queryRaw`
      SELECT * FROM _prisma_migrations 
      WHERE migration_name = ${migrationName} 
      AND finished_at IS NOT NULL;
    `;
    
    return migration && migration.length > 0;
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
};

// 记录已应用的迁移
const recordMigration = async (prisma, migrationName, checksum) => {
  const id = generateUUID();
  const now = new Date().toISOString();
  
  try {
    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations (
        id, checksum, migration_name, started_at, finished_at, applied_steps_count
      ) VALUES (
        ${id}, ${checksum}, ${migrationName}, ${now}, ${now}, 1
      );
    `;
    console.log(`Recorded migration: ${migrationName}`);
  } catch (error) {
    console.error(`Failed to record migration ${migrationName}:`, error);
  }
};

// 生成UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 计算迁移文件的checksum
const calculateChecksum = async (content) => {
  // 使用ESM方式导入crypto
  const crypto = await import('crypto');
  return crypto.default.createHash('sha256').update(content).digest('hex');
};

// 应用单个迁移
const applyMigration = async (prisma, migrationDir, migrationName) => {
  const sqlFilePath = path.join(migrationDir, migrationName, 'migration.sql');
  
  try {
    if (!fs.existsSync(sqlFilePath)) {
      console.error(`Migration SQL file not found: ${sqlFilePath}`);
      return false;
    }
    
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    const sqlStatements = sqlContent.split(';').filter(stmt => stmt.trim());
    
    // 应用每条SQL语句
    for (const statement of sqlStatements) {
      if (statement.trim()) {
        await prisma.$executeRawUnsafe(statement.trim());
      }
    }
    
    // 记录迁移
    const checksum = await calculateChecksum(sqlContent);
    await recordMigration(prisma, migrationName, checksum);
    
    console.log(`Successfully applied migration: ${migrationName}`);
    return true;
  } catch (error) {
    console.error(`Failed to apply migration ${migrationName}:`, error);
    return false;
  }
};

// 主要的迁移函数
const runMigrations = async (dbUrl) => {
  console.log('Running database migrations...');
  
  // 创建一个新的PrismaClient实例用于迁移
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });
  
  try {
    // 确保_prisma_migrations表存在
    await prisma.$executeRawUnsafe(createMigrationsTableSQL);
    
    const migrationsDir = getMigrationsDir();
    console.log('Migrations directory:', migrationsDir);
    if (!fs.existsSync(migrationsDir)) {
      console.error(`Migrations directory not found: ${migrationsDir}`);
      return false;
    }
    
    // 读取所有迁移目录并按名称排序
    const migrationDirs = fs
      .readdirSync(migrationsDir)
      .filter(dir => {
        const stat = fs.statSync(path.join(migrationsDir, dir));
        return stat.isDirectory() && dir !== 'migration_lock.toml';
      })
      .sort(); // 按名称排序，确保按正确顺序应用
    
    let migrationsApplied = 0;
    
    // 应用每个迁移
    for (const migrationName of migrationDirs) {
      const isApplied = await isMigrationApplied(prisma, migrationName);
      
      if (!isApplied) {
        console.log(`Applying migration: ${migrationName}`);
        const success = await applyMigration(prisma, migrationsDir, migrationName);
        if (success) migrationsApplied++;
      } else {
        console.log(`Migration already applied: ${migrationName}`);
      }
    }
    
    console.log(`Database migration complete. Applied ${migrationsApplied} migrations.`);
    return migrationsApplied > 0;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
};

export {
  runMigrations
}; 