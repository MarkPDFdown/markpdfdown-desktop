import { Request, Response, NextFunction } from 'express';

/**
 * 请求日志中间件
 * 记录所有API请求的信息
 */
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  // 请求完成后记录日志信息
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

/**
 * 错误日志中间件
 * 记录API错误信息
 */
const errorLogger = (err: Error, _req: Request, _res: Response, next: NextFunction): void => {
  console.error(`[${new Date().toISOString()}] 错误: ${err.message}`);
  console.error(err.stack);
  
  next(err);
};

export {
  requestLogger,
  errorLogger
}; 