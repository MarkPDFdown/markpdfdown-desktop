export enum PageStatus {
  FAILED = -1,      // 失败
  PENDING = 0,      // 等待转换 (default)
  PROCESSING = 1,   // 转换中
  COMPLETED = 2,    // 成功
  RETRYING = 3,     // 重试中
}
