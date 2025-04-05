const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { requestLogger, errorLogger } = require('./middleware/logger');
const db = require('./db');

// 初始化Express应用
const app = express();

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(requestLogger);

// 导入路由
const userRoutes = require('./routes/userRoutes');

// 使用路由
app.use('/api/users', userRoutes);

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
    await db.disconnect();
    console.log('Backend server has been shut down');
    process.exit(0);
});

let server = null;

module.exports = {
    start: async () => {
        // 确保不会重复启动服务器
        if (server) {
            return server;
        }
        
        // 在启动服务器前初始化数据库
        await db.initDatabase();
        
        // 启动服务器并监听随机端口
        server = app.listen(0, 'localhost');
        return server;
    },
    getServer: () => server,
    app
}; 