import { Request, Response, NextFunction } from 'express';
import model from '../logic/model.js';

// 补全请求
const completion = async (req: Request, res: Response, next: NextFunction) => {
    // 验证请求
    if (!req.body.providerId || !req.body.modelId || !req.body.messages) {
        return res.status(400).json({ message: 'providerId, modelId, messages 为必填项' });
    }

    try {
        const { providerId, modelId, messages, options } = req.body;
        const completion = await model.completion(providerId, modelId, messages, options);
        res.json(completion);
    } catch (error) {
        next(error);
    }
}

// 测试模型连接
const testConnection = async (req: Request, res: Response, next: NextFunction) => {
    // 验证请求
    if (!req.body.providerId || !req.body.modelId) {
        return res.status(400).json({ message: 'providerId, modelId 为必填项' });
    }
    try {
        const { providerId, modelId } = req.body;
        const test = await model.testConnection(Number(providerId), modelId);
        res.json(test);
    } catch (error) {
        next(error);
    }
}

export default {
    completion,
    testConnection
} 