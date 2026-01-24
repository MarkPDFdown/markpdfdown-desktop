import { prisma } from "../../db/index.js";

/**
 * 获取任务的所有页面详情
 */
const findByTaskId = async (taskId: string) => {
  return await prisma.taskDetail.findMany({
    where: { task: taskId },
    orderBy: {
      page: 'asc',
    },
  });
};

/**
 * 获取指定任务的指定页面详情
 */
const findByTaskAndPage = async (taskId: string, page: number) => {
  return await prisma.taskDetail.findFirst({
    where: {
      task: taskId,
      page: page,
    },
  });
};

/**
 * 统计任务的页面数
 */
const countByTaskId = async (taskId: string) => {
  return await prisma.taskDetail.count({
    where: { task: taskId },
  });
};

export default {
  findByTaskId,
  findByTaskAndPage,
  countByTaskId,
};
