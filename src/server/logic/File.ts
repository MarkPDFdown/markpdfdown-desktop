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

// 删除任务对应的文件
const deleteTaskFiles = (id: string) => {
  const baseUploadDir = getUploadDir();
  const uploadDir = path.join(baseUploadDir, id);
  
  // 检查路径是否存在
  if (fs.existsSync(uploadDir)) {
    // 如果是目录，使用递归删除
    if (fs.lstatSync(uploadDir).isDirectory()) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    } else {
      // 如果是文件，使用unlinkSync
      fs.unlinkSync(uploadDir);
    }
  }
}; 

export default {
  getUploadDir,
  deleteTaskFiles,
};