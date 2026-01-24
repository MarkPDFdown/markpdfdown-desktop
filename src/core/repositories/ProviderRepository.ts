import { prisma } from "../db/index.js";
import { Provider } from "../../shared/types/Provider.js";

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
const create = async (data: Provider) => {  
  return await prisma.provider.create({
    data: {
      name: data?.name || '',
      type: data?.type || '',
      api_key: data?.api_key || '',
      base_url: data?.base_url || '',
      suffix: data?.suffix || '',
      status: data?.status || 0,
    }
  });
};

// 更新提供商
const update = async (id: number, data: Provider) => {
  return await prisma.provider.update({
    where: { id },
    data: data,
  });
};

// 删除提供商
const remove = async (id: number) => {
  // 同时删除关联的model
  await prisma.model.deleteMany({
    where: { provider: id },
  });
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