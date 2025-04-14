import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { requestLogger, errorLogger } from './middleware/logger.js';
import { initDatabase, disconnect } from './db/index.js';

// 初始化Express应用
const app = express();

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(requestLogger);

// 导入路由
import routes from './routes/routes.js';

// 使用路由
app.use('/api', routes);

// 健康检查
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 错误日志中间件
app.use(errorLogger);

// 错误处理中间件
app.use((err, req, res, next) => {
    res.status(500).json({
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 优雅关闭
process.on('SIGINT', async () => {
    await disconnect();
    console.log('Backend server has been shut down');
    process.exit(0);
});

let server = null;

export { app };
export const start = async () => {
    // 确保不会重复启动服务器
    if (server) {
        return server;
    }
    
    // 在启动服务器前初始化数据库
    await initDatabase();
    
    // 启动服务器并监听随机端口
    server = app.listen(0, 'localhost');
    return server;
};

export const getServer = () => server; 