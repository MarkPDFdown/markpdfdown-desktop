import { Request, Response, NextFunction } from 'express';
import taskDal from '../dal/TaskDal.js';
import fileLogic from '../logic/File.js';

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

// 获取所有任务,支持分页
const getAllTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const tasks = await taskDal.findAll(Number(page), Number(pageSize));
    const total = await taskDal.getTotal();
    res.status(200).json({ list: tasks, total });
  } catch (error) { 
    next(error);
  }
};

// 更新任务
const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const task = req.body;
    const updatedTask = await taskDal.update(id, task);
    res.status(200).json(updatedTask);
  } catch (error) {
    next(error);
  }
};

// 删除任务
const deleteTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deletedTask = await taskDal.remove(id);
    // 删除任务后，删除任务对应的文件
    fileLogic.deleteTaskFiles(id);
    res.status(200).json(deletedTask);
  } catch (error) {
    next(error);
  }
};


export default {
  createTasks,
  getAllTasks,
  updateTask,
  deleteTask,
};