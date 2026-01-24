import { prisma } from "../../infrastructure/db/index.js";

interface ModelData {
    id: string;
    provider: number;
    name: string;
}

// 查找所有模型
const findAll = async () => {
    return await prisma.model.findMany({
        orderBy: [{ createdAt: "desc" }],
    });
};

// 根据服务商ID查找模型
const findByProviderId = async (provider: number) => {
    return await prisma.model.findMany({
        where: { provider },
        orderBy: [{ createdAt: "desc" }],
    });
};

// 创建模型
const create = async (modelData: ModelData) => {
    return await prisma.model.create({
        data: modelData,
    });
};

// 删除模型 根据id和provider删除
const remove = async (id: string, provider: number) => {
    return await prisma.model.delete({
        where: {
            id_provider: {
                id: id,
                provider: provider
            }
        }
    });
};

// 批量删除指定服务商的模型
const removeByProviderId = async (provider: number) => {
    return await prisma.model.deleteMany({
        where: { provider },
    });
};


export default {
    findAll,
    findByProviderId,
    create,
    remove,
    removeByProviderId,
}; 