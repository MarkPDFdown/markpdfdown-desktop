import { prisma } from '../db/index.js';

// 查找所有提供商
const findAll = async () => {
    return await prisma.provider.findMany({
        select: {
            id: true,
            name: true,
            type: true,
            api_key: true,
            base_url: true,
            suffix: true,
            status: true,
            createdAt: true,
            updatedAt: true
        },
        orderBy: [
            { name: 'asc' },
            { createdAt: 'desc' }
        ]
    });
};

// 根据ID查找提供商
const findById = async (id) => {
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
            updatedAt: true
        }
    });
};

// 创建提供商
const create = async (providerData) => {
    return await prisma.provider.create({
        data: providerData
    });
};

// 更新提供商
const update = async (id, updateData) => {
    return await prisma.provider.update({
        where: { id },
        data: updateData
    });
};

// 删除提供商
const remove = async (id) => {
    return await prisma.provider.delete({
        where: { id }
    });
};

// 更新提供商状态
const updateStatus = async (id, status) => {
    return await prisma.provider.update({
        where: { id },
        data: { status }
    });
};

export default {
    findAll,
    findById,
    create,
    update,
    remove,
    updateStatus
}