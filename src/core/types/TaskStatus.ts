export enum TaskStatus {
  CREATED = -1,         // 已创建，等待文件上传
  FAILED = 0,           // 失败
  PENDING = 1,          // 等待拆分
  SPLITTING = 2,        // 拆分中
  PROCESSING = 3,       // 转换中
  READY_TO_MERGE = 4,   // 准备合并
  MERGING = 5,          // 合并中
  COMPLETED = 6,        // 成功完成
  CANCELLED = 7,        // 已取消
  PARTIAL_FAILED = 8,   // 部分页面失败
}
