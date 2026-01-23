import { app } from "electron";
import isDev from "electron-is-dev";
import path from "path";
import fs from "fs";

// 获取上传目录
const getUploadDir = () => {
  // DEV目录
  if (isDev) {
    return path.join(process.cwd(), 'files');
  }
  // 打包目录
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'files');
};

// 获取临时目录
const getTempDir = () => {
  // DEV目录
  if (isDev) {
    return path.join(process.cwd(), 'temp');
  }
  // 打包目录
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'temp');
};

// 删除单个目录或文件
const deleteDirectory = (dirPath: string) => {
  if (fs.existsSync(dirPath)) {
    if (fs.lstatSync(dirPath).isDirectory()) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(dirPath);
    }
  }
};

// 获取拆分结果目录
const getSplitDir = (taskId: string) => {
  return path.join(getUploadDir(), taskId, 'split');
};

// 删除任务对应的所有文件（包括上传文件、拆分文件和临时文件）
const deleteTaskFiles = (id: string) => {
  // 删除上传目录 (files/{taskId})，包括子目录 split
  const uploadDir = path.join(getUploadDir(), id);
  deleteDirectory(uploadDir);

  // 删除临时目录 (temp/{taskId})
  const tempDir = path.join(getTempDir(), id);
  deleteDirectory(tempDir);
};

export default {
  getUploadDir,
  getTempDir,
  getSplitDir,
  deleteTaskFiles,
};