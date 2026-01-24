import type { Task } from '../../../shared/types/Task.js';

/**
 * Task Input for creation
 */
export interface TaskInput {
  filename: string;
  type: string;
  page_range?: string;
  pages?: number;
  provider: number;
  model: string;
  model_name: string;
}

/**
 * Task Service Interface
 */
export interface ITaskService {
  /**
   * Create multiple tasks
   */
  createTasks(tasks: TaskInput[]): Promise<Task[]>;

  /**
   * Get all tasks with pagination
   */
  getTasks(page: number, pageSize: number): Promise<{ list: Task[]; total: number }>;

  /**
   * Get task by ID
   */
  getTaskById(id: string): Promise<Task | null>;

  /**
   * Update task
   */
  updateTask(id: string, data: Partial<Task>): Promise<Task>;

  /**
   * Delete task and associated files
   */
  deleteTask(id: string): Promise<void>;

  /**
   * Check if there are running tasks
   */
  hasRunningTasks(): Promise<{ hasRunning: boolean; count: number }>;
}
