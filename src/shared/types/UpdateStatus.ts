export enum UpdateStatus {
  IDLE = 'idle',
  CHECKING = 'checking',
  AVAILABLE = 'available',
  NOT_AVAILABLE = 'not_available',
  DOWNLOADING = 'downloading',
  DOWNLOADED = 'downloaded',
  ERROR = 'error',
}

export interface UpdateStatusData {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}
