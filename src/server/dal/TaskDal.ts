import { prisma } from "../db/index.js";
import type { Task } from "../types/Task.js";
import { v4 as uuidv4 } from 'uuid';
// 查找所有任务，支持分页
const findAll = async (page: number, pageSize: number) => {
  return await prisma.task.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: {
      createdAt: 'desc',
    },
  });
};

// 查询任务总数
const getTotal = async () => {
  return await prisma.task.count();
};

// 创建任务
const create = async (task: Task) => {
  return await prisma.task.create({
    data: {
      id: uuidv4(),
      filename: task?.filename || '',
      type: task?.type || '',
      page_range: task?.page_range || '',
      pages: task?.pages || 0,
      provider: task?.provider || 0,
      model: task?.model || '',
      model_name: task?.model_name || '',
      progress: 0,
      status: 0,
    }
  });
};

// 批量创建任务
const createTasks = async (tasks: Task[]) => {
  const createdTasks = [];
  for (const task of tasks) {
    const createdTask = await create(task);
    createdTasks.push(createdTask);
  }
  return createdTasks;
};

export default {
  findAll,
  create,
  createTasks,
  getTotal,
};
