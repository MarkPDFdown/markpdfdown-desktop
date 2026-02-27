import type { Task } from '../../shared/types/Task';
import type { CloudTaskResponse } from '../../shared/types/cloud-api';

/**
 * Map a cloud API task response (snake_case) to the local Task interface (camelCase).
 * Cloud tasks are marked with provider=-1 and isCloud=true.
 */
export function mapCloudTaskToTask(ct: CloudTaskResponse): Task & { isCloud: boolean } {
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
  };
}

/**
 * Map an array of cloud tasks
 */
export function mapCloudTasksToTasks(cloudTasks: CloudTaskResponse[]): (Task & { isCloud: boolean })[] {
  return cloudTasks.map(mapCloudTaskToTask);
}
