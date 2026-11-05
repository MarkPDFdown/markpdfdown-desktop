import path from "path";
import fs from "fs";
import isDev from "electron-is-dev";
import { app } from "electron";
import { fileURLToPath } from "url";

// 获取迁移文件目录
const getMigrationsDir = (): string => {
  // 在开发环境使用项目目录
  if (isDev) {
    return path.join(
      process.cwd(),
      "src",
      "core",
      "infrastructure",
      "db",
      "migrations",
    );
  }

  // 在打包环境中，确保使用正确的路径
  // 使用 app.getAppPath() 获取应用根目录
  if (app.isPackaged) {
    // 完全打包的应用（如 .exe 安装后），migrations 在 resources 目录
    return path.join(app.getAppPath(), "..", "migrations");
  }

  // npx 模式：未打包但 isDev=false，migrations 在源码目录中
  // 由于 package.json 的 files 字段包含了 src/core/infrastructure/db/migrations
  // 我们需要从当前文件位置向上找到项目根目录
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

  // 从 dist/main 向上找到项目根目录，然后定位到 migrations
  const projectRoot = path.resolve(currentDir, "..", "..");
  const migrationsPath = path.join(
    projectRoot,
    "src",
    "core",
    "infrastructure",
    "db",
    "migrations",
  );

  // 如果在项目源码目录找到，直接返回
  if (fs.existsSync(migrationsPath)) {
    return migrationsPath;
  }

  // 回退：尝试相对于 dist 目录
  return path.join(currentDir, "migrations");
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

// 记录已应用的迁移
const recordMigration = async (
  prisma: any,
  migrationName: string,
  checksum: string,
): Promise<void> => {
  const id = generateUUID();
  const now = new Date().toISOString();

  await prisma.$executeRaw`
    INSERT INTO _prisma_migrations (
      id, checksum, migration_name, started_at, finished_at, applied_steps_count
    ) VALUES (
      ${id}, ${checksum}, ${migrationName}, ${now}, ${now}, 1
    );
  `;
  console.log(`Recorded migration: ${migrationName}`);
};

// 生成UUID
const generateUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 计算迁移文件的checksum
const calculateChecksum = async (content: string): Promise<string> => {
  // 使用ESM方式导入crypto
  const crypto = await import("crypto");
  return crypto.default.createHash("sha256").update(content).digest("hex");
};

// 改表的迁移要复制整张表，页面内容又存在表里，所以比默认的 5 秒宽裕得多
const MIGRATION_TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 5 * 60_000 };

// 应用单个迁移
const applyMigration = async (
  prisma: any,
  migrationDir: string,
  migrationName: string,
): Promise<void> => {
  const sqlFilePath = path.join(migrationDir, migrationName, "migration.sql");

  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`Migration SQL file not found: ${sqlFilePath}`);
  }

  const sqlContent = fs.readFileSync(sqlFilePath, "utf8");
  const sqlStatements = sqlContent.split(";").filter((stmt) => stmt.trim());

  const checksum = await calculateChecksum(sqlContent);

  // 放进事务才能让所有语句走同一条连接。否则连接池里其他连接的 schema 缓存可能已过期，
  // DROP TABLE 之后的 RENAME 会偶发 "there is already another table"。失败时也不会留下半截结构。
  // 注意事务内 PRAGMA foreign_keys 不生效，改表的迁移不能依赖它。
  await prisma.$transaction(async (tx: any) => {
    for (const statement of sqlStatements) {
      await tx.$executeRawUnsafe(statement.trim());
    }
    await recordMigration(tx, migrationName, checksum);
  }, MIGRATION_TRANSACTION_OPTIONS);

  console.log(`Successfully applied migration: ${migrationName}`);
};

// 批量检查迁移状态（性能优化）
const getAppliedMigrations = async (prisma: any): Promise<Set<string>> => {
  try {
    // 检查 _prisma_migrations 表是否存在
    const tableExists = await prisma.$queryRaw`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='_prisma_migrations';
    `;

    if (!tableExists || tableExists.length === 0) {
      return new Set();
    }

    // 一次性获取所有已应用的迁移
    const migrations = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL;
    `;

    return new Set(migrations.map((m: any) => m.migration_name));
  } catch (error) {
    console.error("Error getting applied migrations:", error);
    return new Set();
  }
};

/**
 * 应用所有未执行的迁移（性能优化版）。
 * 任何失败都会抛出：数据库结构不完整时应用无法正常工作，调用方需要知道。
 * 遇到第一个失败就停止，因为后面的迁移依赖它的结果。
 */
const runMigrations = async (prisma: any = null): Promise<void> => {
  const startTime = Date.now();
  console.log("Running database migrations...");

  // 确保_prisma_migrations表存在
  await prisma.$executeRawUnsafe(createMigrationsTableSQL);

  const migrationsDir = getMigrationsDir();
  console.log("Migrations directory:", migrationsDir);
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  // 批量获取所有已应用的迁移（性能优化）
  const appliedMigrations = await getAppliedMigrations(prisma);

  // 读取所有迁移目录并按名称排序（优化：减少 stat 调用）
  const migrationDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(
      (dirent) =>
        dirent.isDirectory() && dirent.name !== "migration_lock.toml",
    )
    .map((dirent) => dirent.name)
    .sort(); // 按名称排序，确保按正确顺序应用

  let migrationsApplied = 0;

  // 应用每个迁移
  for (const migrationName of migrationDirs) {
    // 使用批量查询结果检查（避免单独查询）
    if (appliedMigrations.has(migrationName)) {
      console.log(`Migration already applied: ${migrationName}`);
      continue;
    }

    console.log(`Applying migration: ${migrationName}`);
    try {
      await applyMigration(prisma, migrationsDir, migrationName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to apply migration ${migrationName}: ${reason}`);
    }
    migrationsApplied++;
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `Database migration complete. Applied ${migrationsApplied} migrations in ${elapsed}ms`,
  );
};

export { runMigrations };
