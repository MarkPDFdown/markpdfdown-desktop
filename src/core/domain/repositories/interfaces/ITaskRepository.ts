import type { Task } from '../../../shared/types/Task.js';
import type { TaskStatus } from '../../../shared/types/TaskStatus.js';

/**
 * Task Repository Interface
 */
export interface ITaskRepository {
  /**
   * Find all tasks with pagination
   */
  findAll(page: number, pageSize: number): Promise<Task[]>;

  /**
   * Find task by ID
   */
  findById(id: string): Promise<Task | null>;

  /**
   * Create a new task
   */
  create(task: Task): Promise<Task>;

  /**
   * Create multiple tasks
   */
  createTasks(tasks: Task[]): Promise<Task[]>;

  /**
   * Update task
   */
  update(id: string, data: Partial<Task>): Promise<Task>;

  /**
   * Remove task
   */
  remove(id: string): Promise<void>;

  /**
   * Get total count of tasks
   */
  getTotal(): Promise<number>;

  /**
   * Claim a task atomically (for worker processing)
   */
  claimTask(
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
    workerId: string
  ): Promise<Task | null>;
}
