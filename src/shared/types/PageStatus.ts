export enum PageStatus {
  FAILED = -1,      // Failed
  PENDING = 0,      // Waiting for conversion (default)
  PROCESSING = 1,   // Converting
  COMPLETED = 2,    // Completed successfully
  RETRYING = 3,     // Retrying
}
