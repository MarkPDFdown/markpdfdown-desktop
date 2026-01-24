import type { PageStatus } from '../../../shared/types/PageStatus.js';

/**
 * Task Detail (Page) entity
 */
export interface TaskDetail {
  id?: number;
  task: string;
  page: number;
  status: PageStatus;
  content?: string;
  error?: string | null;
  retry_count?: number;
  worker_id?: string | null;
  started_at?: Date | null;
  completed_at?: Date | null;
  input_tokens?: number;
  output_tokens?: number;
  conversion_time?: number;
}

/**
 * Task Detail Repository Interface
 */
export interface ITaskDetailRepository {
  /**
   * Find all task details by task ID
   */
  findByTaskId(taskId: string): Promise<TaskDetail[]>;

  /**
   * Find task detail by task ID and page number
   */
  findByTaskAndPage(taskId: string, page: number): Promise<TaskDetail | null>;

  /**
   * Count task details by task ID
   */
  countByTaskId(taskId: string): Promise<number>;

  /**
   * Claim a page atomically (for worker processing)
   */
  claimPage(
    fromStatus: PageStatus,
    toStatus: PageStatus,
    workerId: string
  ): Promise<TaskDetail | null>;
}
