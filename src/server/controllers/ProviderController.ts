import { Request, Response, NextFunction } from 'express';
import providerDal from '../dal/ProviderDal.js';
import { Provider } from '../types/Provider.js';

// 获取所有服务商
const getAllProviders = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = await providerDal.findAll();
    res.json(providers);
  } catch (error) {
    next(error);
  }
};

// 根据ID获取服务商
const getProviderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const provider = await providerDal.findById(Number(id));
    
    if (!provider) {
      return res.status(404).json({ message: '服务商不存在' });
    }
    
    res.json(provider);
  } catch (error) {
    next(error);
  }
};

// 创建服务商
const createProvider = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type } = req.body;
    
    // 验证请求
    if (!name || !type) {
      return res.status(400).json({ message: '名称和协议类型为必填项' });
    }
    
    // 创建服务商
    const newProvider = await providerDal.create({
      name,
      type,
      api_key: '',
      base_url: '',
      suffix: '',
      status: 0 // 默认启用
    });
    
    res.status(201).json(newProvider);
  } catch (error) {
    next(error);
  }
};

// 更新服务商
const updateProvider = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { api_key, base_url, suffix } = req.body;
    
    // 验证服务商存在
    const existingProvider = await providerDal.findById(Number(id));
    if (!existingProvider) {
      return res.status(404).json({ message: '服务商不存在' });
    }
    
    // 准备更新数据
    const updateData: Provider = {};
    if (api_key !== undefined) updateData.api_key = api_key;
    if (base_url !== undefined) updateData.base_url = base_url;
    if (suffix !== undefined) updateData.suffix = suffix;
    
    // 更新服务商
    const updatedProvider = await providerDal.update(Number(id), updateData);
    res.json(updatedProvider);
  } catch (error) {
    next(error);
  }
};

// 删除服务商
const deleteProvider = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // 验证服务商存在
    const existingProvider = await providerDal.findById(Number(id));
    if (!existingProvider) {
      return res.status(404).json({ message: '服务商不存在' });
    }
    
    // 删除服务商
    await providerDal.remove(Number(id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// 更新服务商状态
const updateProviderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (status === undefined) {
      return res.status(400).json({ message: '状态值不合法' });
    }
    
    // 验证服务商存在
    const existingProvider = await providerDal.findById(Number(id));
    if (!existingProvider) {
      return res.status(404).json({ message: '服务商不存在' });
    }
    
    // 更新服务商状态
    const updatedProvider = await providerDal.updateStatus(Number(id), Number(status));
    res.json(updatedProvider);
  } catch (error) {
    next(error);
  }
};

export default {
  getAllProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  updateProviderStatus
}; 