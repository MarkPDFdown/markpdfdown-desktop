import { Request, Response, NextFunction } from 'express';
import model from '../logic/Model.js';
import { CompletionOptions, Message } from '../logic/llm/LLMClient.js';

// 转换图片为markdown
const markImagedown = async (req: Request, res: Response, next: NextFunction) => {
    // 验证请求
    if (!req.body.providerId || !req.body.modelId || !req.body.url) {
        return res.status(400).json({ message: 'providerId, modelId, url 为必填项' });
    }

    try {
        const message = await model.transformImageMessage(req.body.url);
        const completionOptions: CompletionOptions = {
            messages: message,
            model: req.body.modelId,
            maxTokens: 204800,
            temperature: 0.3,
            stream: false
        }
        const completion = await model.completion(Number(req.body.providerId), completionOptions);
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
        const imageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAA9lBMVEUAAAD+/v79/f3////7+/v8/Pz29vbe3t7f399GRkb////+/v77+/tiYmL19fX////z8/Pv7+/y8vLl5eXj4+Pe3t7f39/j4+Pd3d3u7u65ubm9vb2wsLCJiYmBgYFcXFxAQED7+/vt7e3Dw8O2trb+/v78/Pz4+Pj29vbz8/Px8fHs7Ozj4+Pt7e3b29vm5ube3t7l5eXr6+vLy8vj4+Pv7+/09PTZ2dnS0tL////Pz8/09PTCwsLFxcW6urqKioqhoaHOzs7KysqQkJCQkJCpqamZmZmQkJC0tLRmZmaTk5N6enrt7e3v7+/s7OzT09PV1dX///8sTJOgAAAAUXRSTlMA/v3+/P3vpqUF+/V/Devy59XUzb27tqyihldMQzQsEgv6rDc0+vPl5OHLyMi5s7CpopuXlZCGgHhybmdlTURCQT4+OjUyMiwnIx0Xw8GwenjtgN1sAAABw0lEQVQ4y5WS13IbMQxFcUGukpVWvXfLknvvcXfiuKfh/38mC3I5I4/tB9+HvShnIFAkfUq9Vn27/3F7H0ZEwEn8fr/AaD+83DY5qj1fD9/2q2bJeRyLDjKF0ev+EOKDrQjYOGgKm6P5/t2yGaj/A3DmKpeR7VLQD0B0wEzAi6FYjLiYhUnENRiiLnhtIc3Hm/qlv1j3/QHbKQkTfeFHzX8z0NJApzrHFXkgl2YnjNk5jE2I8pLtv0oB0G32tNjJs9xkQEd6AaiU7M7upDx2/wvAHqjLUwBsJd07XrENrY8EBQc05D4AJXIqYXKsXsYftQvT9hvrDk65w1Mreqt69mB9saeHAfiaHbGNC80XTVnteILwEylgFLiXhr9oIyO3jV2JiYoVG4AnqTtAGKhqMC7b3R2bqwSgJx0P5G+E2cV7wHfKBWCVf2YAUWLB5zPwSZoH4ArhMpy3YKJfGjyyB6aWBx5Yxze1hc2xftcidFMANY6S8DTYPw13ZkCmbqpuE9S19tIFZ4CfNsDyHc3pCJE0DzaAaMsXoPvPa1SAvnWJY5fmUaU3Gl4/15a4efvy0GYu0PtK2A3CPn2o/na91aPP6D8AojIypyhEagAAAABJRU5ErkJggg==';
        const message: Message[] = [{
            role: 'user',
            content: [{
                type: 'text',
                text: 'What is in the picture?'
            },
            {
                type: 'image_url',
                image_url: {
                    url: imageBase64
                }
            }
        ]
        }];
        const completionOptions: CompletionOptions = {
            messages: message,
            model: modelId,
            maxTokens: 1024,
            temperature: 0.7,
            stream: false
        }
        const test = await model.completion(Number(providerId), completionOptions);
        res.json(test);
    } catch (error) {
        next(error);
    }
}

export default {
    markImagedown,
    testConnection
} 