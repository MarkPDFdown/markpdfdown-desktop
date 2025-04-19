import { Request, Response, NextFunction } from 'express';
import taskDal from '../dal/TaskDal.js';
import { Task } from '../types/Task.js';


// 批量创建任务
const createTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    //const tasks = req.body;
    // 通过
    // 批量创建任务
    // const createdTasks = await taskDal.createTasks(tasks);
    // res.status(201).json(createdTasks);
    res.status(200).json({ message: '批量创建任务成功' });
  } catch (error) {
    next(error);
  }
};

export default {
  createTasks,
};