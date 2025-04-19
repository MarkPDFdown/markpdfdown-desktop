/*
  Warnings:

  - You are about to alter the column `pages` on the `Task` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - Added the required column `page_range` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `content` to the `TaskDetail` table without a default value. This is not possible if the table is not empty.
  - Added the required column `page_source` to the `TaskDetail` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "page_range" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "provider" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Task" ("createdAt", "filename", "id", "model", "model_name", "pages", "progress", "provider", "status", "type", "updatedAt") SELECT "createdAt", "filename", "id", "model", "model_name", "pages", "progress", "provider", "status", "type", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_id_key" ON "Task"("id");
CREATE TABLE "new_TaskDetail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "page_source" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "provider" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TaskDetail" ("createdAt", "id", "model", "page", "provider", "status", "task", "updatedAt") SELECT "createdAt", "id", "model", "page", "provider", "status", "task", "updatedAt" FROM "TaskDetail";
DROP TABLE "TaskDetail";
ALTER TABLE "new_TaskDetail" RENAME TO "TaskDetail";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
