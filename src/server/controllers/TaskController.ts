import { Request, Response, NextFunction } from 'express';
import taskDal from '../dal/TaskDal.js';


// 批量创建任务
const createTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = req.body;
    // 批量创建任务
    const createdTasks = await taskDal.createTasks(tasks);
    res.status(201).json(createdTasks);
  } catch (error) {
    next(error);
  }
};

export default {
  createTasks,
};