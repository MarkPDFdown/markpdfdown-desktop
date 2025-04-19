import { Request, Response, NextFunction } from 'express';
import modelDal from '../dal/modelDal.js';
import providerDal from '../dal/providerDal.js';
// 获取所有启用的模型
const getAllModels = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const providers = await providerDal.findAll();
        // 遍历providers，获取每个provider的模型
        const models = await Promise.all(providers.map(async (provider) => {
            const models = await modelDal.findByProviderId(provider.id);
            return {
                provider: provider.id,
                providerName: provider.name,
                models: models
            };
        }));
        res.json(models);
    } catch (error) {
        next(error);
    }
};

// 获取指定服务商的模型列表
const getModelsByProviderId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { provider } = req.params;
        const models = await modelDal.findByProviderId(Number(provider));
        res.json(models);
    } catch (error) {
        next(error);
    }
};

// 创建模型
const createModel = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id, provider, name } = req.body;

        // 验证请求
        if (!provider || !name || !id) {
            return res.status(400).json({ message: '模型ID、服务商ID、名称和为必填项' });
        }

        // 创建模型
        const newModel = await modelDal.create({
            id,
            provider: Number(provider),
            name,
        });

        res.status(201).json(newModel);
    } catch (error) {
        next(error);
    }
};

// 删除模型
const deleteModel = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id, provider } = req.params;

        // 验证请求
        if (!id || !provider) {
            return res.status(400).json({ message: '模型ID和服务商ID为必填项' });
        }

        // 删除模型
        await modelDal.remove(id, Number(provider));

        res.status(204).json({ message: '模型删除成功' });
    } catch (error) {
        next(error);
    }
};

export default {
    getAllModels,
    getModelsByProviderId,
    createModel,
    deleteModel
}; 