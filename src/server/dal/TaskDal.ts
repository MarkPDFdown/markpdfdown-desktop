import { prisma } from "../db/index.js";

// 查找所有任务，支持分页
const findAll = async (page: number, pageSize: number) => {
  return await prisma.task.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
};

