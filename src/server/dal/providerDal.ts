import { prisma } from "../db/index.js";
import { ProviderData, PartialProviderData } from "../types/Provider.js";

// 查找所有启用的提供商
const findAll = async () => {
  return await prisma.provider.findMany({
    where: {
      status: 0
    },
    select: {
      id: true,
      name: true,
      type: true,
      api_key: true,
      base_url: true,
      suffix: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
};

// 根据ID查找提供商
const findById = async (id: number) => {
  return await prisma.provider.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      api_key: true,
      base_url: true,
      suffix: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

// 创建提供商
const create = async (providerData: Partial<ProviderData>) => {
  // 设置默认值
  const data: ProviderData = {
    name: providerData.name || '',
    type: providerData.type || '',
    api_key: providerData.api_key || '',
    base_url: providerData.base_url || '',
    suffix: providerData.suffix || '',
    status: providerData.status || 0
  };
  
  return await prisma.provider.create({
    data
  });
};

// 更新提供商
const update = async (id: number, updateData: PartialProviderData) => {
  return await prisma.provider.update({
    where: { id },
    data: updateData,
  });
};

// 删除提供商
const remove = async (id: number) => {
  return await prisma.provider.delete({
    where: { id },
  });
};

// 更新提供商状态
const updateStatus = async (id: number, status: number) => {
  return await prisma.provider.update({
    where: { id },
    data: { status },
  });
};

export default {
  findAll,
  findById,
  create,
  update,
  remove,
  updateStatus,
}; 