import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import fileLogic from '../logic/File.js';
// 扩展Request接口以适配multer
interface MulterRequest extends Request {
  files: Express.Multer.File[];
}



// 文件上传处理
const uploadFiles = (req: Request, res: Response, next: NextFunction) => {
  // 获取taskId参数
  const taskId = req.query.taskId as string;
  
  if (!taskId) {
    return res.status(400).json({ message: '缺少任务ID参数' });
  }
  
  // 动态配置存储位置
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      // 获取基础上传目录
      const baseUploadDir = fileLogic.getUploadDir();
      
      // 创建任务ID对应的目录
      const uploadDir = path.join(baseUploadDir, taskId);
      
      // 确保目录存在
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      // 使用taskId作为文件名，保留原始扩展名
      const extname = path.extname(file.originalname);
      cb(null, taskId + extname);
    }
  });
  
  // 创建multer实例
  const upload = multer({ storage }).array('files');
  
  // 使用multer中间件处理上传
  upload(req, res, (err) => {
    if (err) {
      return next(err);
    }
    
    try {
      const multerReq = req as MulterRequest;
      // 检查是否上传了文件
      if (!multerReq.files || multerReq.files.length === 0) {
        return res.status(400).json({ message: '没有上传文件' });
      }

      const uploadedFiles = multerReq.files.map(file => ({
        originalName: file.originalname, // 原始文件名（包含中文）
        savedName: path.basename(file.path), // 保存的文件名（taskId + 扩展名）
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        taskId: taskId
      }));

      res.status(200).json({ 
        message: '文件上传成功',
        files: uploadedFiles
      });
    } catch (error) {
      next(error);
    }
  });
};

export default {
  uploadFiles,
}; 