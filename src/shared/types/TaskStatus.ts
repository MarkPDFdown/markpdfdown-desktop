export enum TaskStatus {
  CREATED = -1,         // Created, waiting for file upload
  FAILED = 0,           // Failed
  PENDING = 1,          // Waiting for split
  SPLITTING = 2,        // Splitting
  PROCESSING = 3,       // Converting
  READY_TO_MERGE = 4,   // Ready to merge
  MERGING = 5,          // Merging
  COMPLETED = 6,        // Completed successfully
  CANCELLED = 7,        // Cancelled
  PARTIAL_FAILED = 8,   // Some pages failed
}
