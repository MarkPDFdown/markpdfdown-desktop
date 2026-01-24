-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "page_range" TEXT NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "provider" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT -1,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "worker_id" TEXT,
    "merged_path" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Task" ("completed_count", "createdAt", "error", "failed_count", "filename", "id", "merged_path", "model", "model_name", "page_range", "pages", "progress", "provider", "status", "type", "updatedAt", "worker_id") SELECT "completed_count", "createdAt", "error", "failed_count", "filename", "id", "merged_path", "model", "model_name", "page_range", "pages", "progress", "provider", "status", "type", "updatedAt", "worker_id" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_id_key" ON "Task"("id");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_status_updatedAt_idx" ON "Task"("status", "updatedAt");
CREATE TABLE "new_TaskDetail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "page_source" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "worker_id" TEXT,
    "provider" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "conversion_time" INTEGER NOT NULL DEFAULT 0,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TaskDetail" ("content", "createdAt", "error", "id", "model", "page", "page_source", "provider", "retry_count", "status", "task", "updatedAt", "worker_id") SELECT "content", "createdAt", "error", "id", "model", "page", "page_source", "provider", "retry_count", "status", "task", "updatedAt", "worker_id" FROM "TaskDetail";
DROP TABLE "TaskDetail";
ALTER TABLE "new_TaskDetail" RENAME TO "TaskDetail";
CREATE INDEX "TaskDetail_task_status_idx" ON "TaskDetail"("task", "status");
CREATE INDEX "TaskDetail_task_page_idx" ON "TaskDetail"("task", "page");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
