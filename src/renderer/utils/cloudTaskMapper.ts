import type { Task } from '../../shared/types/Task';
import type { CloudTaskResponse } from '../../shared/types/cloud-api';

/**
 * Extended Task interface with sort timestamp for cloud tasks.
 * This allows unified sorting of local and cloud tasks.
 */
export interface CloudTask extends Task {
  isCloud: boolean;
  /** Unix timestamp in ms for sorting */
  sortTimestamp: number;
}

/**
 * Map a cloud API task response (snake_case) to the local Task interface (camelCase).
 * Cloud tasks are marked with provider=-1 and isCloud=true.
 * Also adds sortTimestamp for unified sorting with local tasks.
 */
export function mapCloudTaskToTask(ct: CloudTaskResponse): CloudTask {
  const pageCount = ct.page_count || 0;
  const pagesCompleted = ct.pages_completed || 0;

  // Compute progress: completed status = 100%, otherwise ratio
  let progress = 0;
  if (ct.status === 6) {
    progress = 100;
  } else if (pageCount > 0) {
    progress = Math.round((pagesCompleted / pageCount) * 100);
  }

  // Map file_type to extension for the type field
  let type: string = ct.file_type;
  if (ct.file_type === 'office') {
    // Extract extension from file_name
    const ext = ct.file_name.split('.').pop()?.toLowerCase();
    type = ext || 'pdf';
  }

  // Map model tier to display name (matching UploadPanel)
  const modelTierMap: Record<string, string> = {
    lite: 'Fit Lite',
    pro: 'Fit Pro',
    ultra: 'Fit Ultra',
  };

  // Parse created_at to unified timestamp (Unix timestamp in milliseconds)
  // Use started_at as fallback if created_at is not available
  const sortTimestamp = ct.created_at
    ? new Date(ct.created_at).getTime()
    : (ct.started_at ? new Date(ct.started_at).getTime() : Date.now());

  return {
    id: ct.id,
    filename: ct.file_name,
    type,
    pages: pageCount,
    provider: -1,
    model_name: modelTierMap[ct.model_tier?.toLowerCase() || ''] || 'Cloud',
    progress,
    status: ct.status,
    completed_count: pagesCompleted,
    failed_count: ct.pages_failed || 0,
    isCloud: true,
    sortTimestamp,
  };
}

/**
 * Map an array of cloud tasks
 */
export function mapCloudTasksToTasks(cloudTasks: CloudTaskResponse[]): CloudTask[] {
  return cloudTasks.map(mapCloudTaskToTask);
}
