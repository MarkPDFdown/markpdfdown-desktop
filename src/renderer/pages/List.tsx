import React, { useEffect, useState, useCallback, useRef, useContext } from "react";
import { Progress, Space, Table, Tooltip, Typography, Tag, App } from "antd";
import {
  FilePdfTwoTone,
  FileImageTwoTone,
  FileTwoTone,
  FileWordTwoTone,
  FilePptTwoTone,
  FileExcelTwoTone,
  CloudOutlined
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Task } from "../../shared/types/Task";
import { CloudContext } from "../contexts/CloudContextDefinition";
import { mapCloudTasksToTasks, type CloudTask } from "../utils/cloudTaskMapper";
import type { CloudSSEEvent } from "../../shared/types/cloud-api";

const { Text } = Typography;

const List: React.FC = () => {
  const { message, modal } = App.useApp();
  const { t } = useTranslation('list');
  const { t: tCommon } = useTranslation('common');
  const cloudContext = useContext(CloudContext);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<(Task | CloudTask)[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const [pollInterval, setPollInterval] = useState(120000); // 默认120秒
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 ref 存储 pagination，避免 useEffect 无限循环
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;

  // Max items to fetch for unified sorting and local pagination
  const MAX_FETCH_ITEMS = 100;

  const fetchTasks = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      // Fetch enough data for unified sorting and local pagination
      // We fetch up to MAX_FETCH_ITEMS from each source, then combine and paginate locally

      // Parallel fetch local and cloud tasks
      const promises: Promise<any>[] = [
        window.api.task.getAll({ page: 1, pageSize: MAX_FETCH_ITEMS })
      ];

      // Only fetch cloud tasks if authenticated
      if (cloudContext?.isAuthenticated) {
        promises.push(cloudContext.getTasks(1, MAX_FETCH_ITEMS));
      }

      const results = await Promise.all(promises);
      const localResult = results[0];
      const cloudResult = results.length > 1 ? results[1] : null;

      let combinedList: (Task | CloudTask)[] = [];
      let totalCount = 0;

      // Handle local tasks
      if (localResult.success && localResult.data) {
        combinedList = [...localResult.data.list];
        totalCount += localResult.data.total;
      } else {
        message.error(localResult.error || t('messages.fetch_failed'));
      }

      // Handle cloud tasks
      if (cloudResult) {
        if (cloudResult.success && cloudResult.data) {
          const cloudTasks = mapCloudTasksToTasks(cloudResult.data);
          // Add cloud task count to total for accurate pagination
          if (cloudResult.pagination) {
            totalCount += cloudResult.pagination.total;
          }
          // Merge cloud and local tasks
          combinedList = [...cloudTasks, ...combinedList];
        } else {
           console.error("Failed to fetch cloud tasks:", cloudResult.error);
        }
      }

      // Sort by unified timestamp (newest first)
      // Cloud tasks use sortTimestamp, local tasks use createdAt
      const getTimestamp = (t: Task | CloudTask): number => {
        const task = t as any;
        if (task.sortTimestamp) return task.sortTimestamp;
        const createdAt = task.createdAt;
        if (!createdAt) return 0;
        if (createdAt instanceof Date) return createdAt.getTime();
        return 0;
      };
      combinedList.sort((a, b) => getTimestamp(b) - getTimestamp(a));

      // Local pagination: slice the sorted combined list
      const startIndex = (page - 1) * pageSize;
      const paginatedList = combinedList.slice(startIndex, startIndex + pageSize);

      setData(paginatedList);
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: totalCount,
      }));

    } catch (error) {
      console.error("Failed to fetch task list:", error);
      message.error(t('messages.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [message, t, cloudContext]);

  const handleTaskEvent = useCallback((event: any) => {
    const { type, taskId, task } = event;

    console.log(`[List] Received task event: ${type}`, { taskId, task });

    setData(prevData => {
      const newData = [...prevData];
      const index = newData.findIndex(t => t.id === taskId);

      switch (type) {
        case 'task:updated':
        case 'task:status_changed':
        case 'task:progress_changed':
          if (index !== -1 && task) {
            newData[index] = { ...newData[index], ...task };
            return newData;
          } else if (index === -1) {
            // 任务不在当前列表中，可能是新任务或不在当前页
            // 触发刷新以获取最新数据
            fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
          }
          break;

        case 'task:deleted':
          if (index !== -1) {
            newData.splice(index, 1);
            setPagination(prev => ({ ...prev, total: prev.total - 1 }));
            return newData;
          }
          break;
      }

      return prevData;
    });

    // 动态调整轮询间隔
    if (type === 'task:status_changed' && task?.status) {
      if (task.status >= 1 && task.status <= 5) {
        setPollInterval(60000); // 活跃任务：60秒
      } else {
        setPollInterval(120000); // 空闲：120秒
      }
    }
  }, [fetchTasks]);

  useEffect(() => {
    fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
  }, [fetchTasks]);

  useEffect(() => {
    console.log('[List] Registering task event listener');
    const cleanup = window.api.events.onTaskEvent(handleTaskEvent);
    return () => {
      console.log('[List] Cleaning up task event listener');
      cleanup();
    };
  }, [handleTaskEvent]);

  // Listen for cloud SSE events to update task list in real-time
  useEffect(() => {
    if (!window.api?.events?.onCloudTaskEvent) return;

    console.log('[List] Registering cloud SSE event listener');

    // Track tasks not found in list to trigger a single refresh
    let pendingRefresh = false;

    const handleCloudEvent = (event: CloudSSEEvent) => {
      const { type, data } = event;

      // Skip non-business events
      if (type === 'heartbeat' || type === 'connected') return;

      const taskId = (data as any).task_id;
      if (!taskId) return;

      console.log(`[List] Cloud SSE event: type=${type}, task_id=${taskId}`);

      setData(prevData => {
        const index = prevData.findIndex(t => t.id === taskId);
        if (index === -1) {
          // Task not in list, schedule a refresh outside of setState
          if (!pendingRefresh) {
            pendingRefresh = true;
            queueMicrotask(() => {
              pendingRefresh = false;
              fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
            });
          }
          return prevData;
        }

        const newData = [...prevData];
        const task = { ...newData[index] };

        switch (type) {
          case 'page_started':
          case 'page_retry_started': {
            task.status = 3; // PROCESSING
            break;
          }
          case 'page_completed': {
            const pageNumber = (data as any).page;
            const totalPages = (data as any).total_pages || task.pages || 1;
            // Use page number directly to avoid duplicate counting from replayed events
            // page is 1-based, so completed_count = page number when pages complete in order
            const completed = Math.max(task.completed_count || 0, pageNumber || 0);
            task.completed_count = completed;
            task.progress = Math.round((completed / totalPages) * 100);
            task.status = 3; // PROCESSING
            break;
          }
          case 'page_failed': {
            // Increment as approximation; the 'completed' event provides authoritative pages_failed
            task.failed_count = (task.failed_count || 0) + 1;
            break;
          }
          case 'completed': {
            task.status = (data as any).status || 6;
            task.progress = 100;
            task.completed_count = (data as any).pages_completed;
            task.failed_count = (data as any).pages_failed;
            break;
          }
          case 'error': {
            task.status = 0; // FAILED
            task.error = (data as any).error;
            break;
          }
          case 'cancelled': {
            task.status = 7; // CANCELLED
            break;
          }
          case 'pdf_ready': {
            task.status = 3; // PROCESSING (splitting done, pages ready for conversion)
            task.pages = (data as any).page_count;
            break;
          }
          default:
            return prevData;
        }

        newData[index] = task;
        return newData;
      });
    };

    const cleanup = window.api.events.onCloudTaskEvent(handleCloudEvent);
    return () => {
      console.log('[List] Cleaning up cloud SSE event listener');
      cleanup();
    };
  }, [fetchTasks]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);

      if (visible) {
        console.log('[List] Page visible, refreshing...');
        fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchTasks]);

  useEffect(() => {
    // 清理旧定时器
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    // 仅在页面可见时启动轮询
    if (isPageVisible) {
      console.log(`[List] Starting poll with interval: ${pollInterval}ms`);

      pollTimerRef.current = setInterval(() => {
        fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
      }, pollInterval);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchTasks, isPageVisible, pollInterval]);

  const handleTableChange = (newPagination: any) => {
    fetchTasks(newPagination.current, newPagination.pageSize);
  };

  // 删除任务（支持本地和云端任务）
  const handleDeleteTask = async (id: string, isCloud: boolean = false) => {
    modal.confirm({
      title: t('confirmations.delete_title'),
      content: t('confirmations.delete_content'),
      okText: t('confirmations.ok'),
      cancelText: t('confirmations.cancel'),
      onOk: async () => {
        try {
          let result;
          if (isCloud) {
            // 云端任务删除
            result = await window.api.cloud.deleteTask(id);
          } else {
            // 本地任务删除
            result = await window.api.task.delete(id);
          }
          if (result.success) {
            message.success(t('messages.delete_success'));
            fetchTasks(pagination.current, pagination.pageSize);
          } else {
            message.error(result.error || t('messages.delete_failed'));
          }
        } catch (error) {
          console.error("Failed to delete task:", error);
          message.error(t('messages.delete_failed'));
        }
      },
    });
  };

  // 更新任务状态
  const handleUpdateTaskStatus = async (
    id: string,
    status: number,
    statusText: string,
  ) => {
    modal.confirm({
      title: t('confirmations.cancel_title', { action: statusText }),
      content: t('confirmations.cancel_content', { action: statusText }),
      okText: t('confirmations.ok'),
      cancelText: t('confirmations.cancel'),
      onOk: async () => {
        try {
          const result = await window.api.task.update(id, { status });
          if (result.success) {
            message.success(t('messages.action_success', { action: statusText }));
            fetchTasks(pagination.current, pagination.pageSize);
          } else {
            message.error(result.error || t('messages.action_failed', { action: statusText }));
          }
        } catch (error) {
          console.error(`Failed to ${statusText} task:`, error);
          message.error(t('messages.action_failed', { action: statusText }));
        }
      },
    });
  };

  // 重试任务
  const handleRetryTask = (id: string) => {
    handleUpdateTaskStatus(id, 1, t('actions.retry'));
  };

  // 取消任务
  const handleCancelTask = (id: string) => {
    handleUpdateTaskStatus(id, 7, t('actions.cancel'));
  };

  // 云端取消任务
  const handleCloudCancelTask = async (id: string) => {
    if (!cloudContext) return;
    modal.confirm({
      title: t('confirmations.cancel_title', { action: t('actions.cancel') }),
      content: t('confirmations.cancel_content', { action: t('actions.cancel') }),
      okText: t('confirmations.ok'),
      cancelText: t('confirmations.cancel'),
      onOk: async () => {
        try {
          const result = await cloudContext.cancelTask(id);
          if (result.success) {
            message.success(t('messages.action_success', { action: t('actions.cancel') }));
            fetchTasks(pagination.current, pagination.pageSize);
          } else {
            message.error(result.error || t('messages.action_failed', { action: t('actions.cancel') }));
          }
        } catch {
          message.error(t('messages.action_failed', { action: t('actions.cancel') }));
        }
      },
    });
  };

  // 云端重试任务
  const handleCloudRetryTask = async (id: string) => {
    if (!cloudContext) return;
    modal.confirm({
      title: t('confirmations.cancel_title', { action: t('actions.retry') }),
      content: t('confirmations.cancel_content', { action: t('actions.retry') }),
      okText: t('confirmations.ok'),
      cancelText: t('confirmations.cancel'),
      onOk: async () => {
        try {
          const result = await cloudContext.retryTask(id);
          if (result.success) {
            message.success(t('messages.action_success', { action: t('actions.retry') }));
            fetchTasks(pagination.current, pagination.pageSize);
          } else {
            message.error(result.error || t('messages.action_failed', { action: t('actions.retry') }));
          }
        } catch {
          message.error(t('messages.action_failed', { action: t('actions.retry') }));
        }
      },
    });
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1:
        return t('status.pending');
      case 2:
        return t('status.initializing');
      case 3:
        return t('status.processing');
      case 4:
        return t('status.merging_pending');
      case 5:
        return t('status.merging');
      case 6:
        return t('status.completed');
      case 7:
        return t('status.cancelled');
      case 0:
        return t('status.failed');
      case 8:
        return t('status.partial_failed');
      default:
        return t('status.unknown');
    }
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 1:
        return "default";
      case 2:
        return "processing";
      case 3:
        return "processing";
      case 4:
        return "processing";
      case 5:
        return "processing";
      case 6:
        return "success";
      case 7:
        return "default";
      case 0:
        return "error";
      case 8:
        return "warning";
      default:
        return "default";
    }
  };

  const columns = [
    {
      title: t('columns.file'),
      dataIndex: "filename",
      width: 280,
      render: (text: string, record: Task) => (
        <Space
          style={{
            maxWidth: "280px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {(() => {
            const fileType = (record.type || "").toLowerCase();
            if (fileType === "pdf") {
              return <FilePdfTwoTone twoToneColor="#ec5f4a" />;
            } else if (
              ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(fileType)
            ) {
              return <FileImageTwoTone twoToneColor="#52c41a" />;
            } else if (["doc", "docx"].includes(fileType)) {
              return <FileWordTwoTone twoToneColor="#1890ff" />;
            } else if (["ppt", "pptx"].includes(fileType)) {
              return <FilePptTwoTone twoToneColor="#fa8c16" />;
            } else if (["xls", "xlsx"].includes(fileType)) {
              return <FileExcelTwoTone twoToneColor="#52c41a" />;
            } else {
              return <FileTwoTone />;
            }
          })()}
          <Tooltip title={text}>
            {(() => {
              if (record.pages && record.pages > 1) {
                return (
                  <Text strong>
                    [{tCommon('common.pages', { count: record.pages })}]{text}
                  </Text>
                );
              } else {
                return <Text strong>{text}</Text>;
              }
            })()}
          </Tooltip>
          {record.provider === -1 && (
             <Tooltip title={t('task_type.cloud')}>
               <CloudOutlined style={{ color: '#1890ff' }} />
             </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('columns.model'),
      dataIndex: "model_name",
      width: 240,
      render: (text: string) => (
        <Text
          style={{
            maxWidth: "240px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </Text>
      ),
    },
    {
      title: t('columns.progress'),
      dataIndex: "progress",
      render: (progress: number) => (
        <Progress
          style={{ minWidth: "120px" }}
          status="normal"
          strokeColor={{ from: "#108ee9", to: "#87d068" }}
          percent={progress}
        />
      ),
    },
    {
      title: t('columns.status'),
      dataIndex: "status",
      width: 100,
      render: (status: number, record: Task) => {
        const tag = <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>;
        // Show error tooltip for failed status
        if (status === 0 && record.error) {
          return <Tooltip title={record.error}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: t('columns.action'),
      dataIndex: "action",
      width: 160,
      render: (_text: string, record: Task) => (
        <Space size="small">
          {(() => {
            const isCloud = record.provider === -1;

            // View button: cloud tasks go to cloud-preview, local to preview
            if (record.status && (record.status > 1 && record.status < 7 || record.status === 8)) {
              const previewPath = isCloud
                ? `/list/cloud-preview/${record.id}`
                : `/list/preview/${record.id}`;
              return (
                <Link type="success" to={previewPath}>
                  {t('actions.view')}
                </Link>
              );
            }
          })()}
          {(() => {
            const isCloud = record.provider === -1;
            if (record.status && record.status > 0 && record.status < 6) {
              return (
                <Text
                  type="secondary"
                  style={{ cursor: "pointer" }}
                  onClick={() => record.id && (isCloud ? handleCloudCancelTask(record.id) : handleCancelTask(record.id))}
                >
                  {t('actions.cancel')}
                </Text>
              );
            }
          })()}
          {(() => {
            const isCloud = record.provider === -1;
            if (record.status === 0) {
              return (
                <Text
                  type="warning"
                  style={{ cursor: "pointer" }}
                  onClick={() => record.id && (isCloud ? handleCloudRetryTask(record.id) : handleRetryTask(record.id))}
                >
                  {t('actions.retry')}
                </Text>
              );
            }
          })()}
          {(() => {
            // 云端任务删除：仅终态可删除 (FAILED=0, COMPLETED=6, CANCELLED=7, PARTIAL_FAILED=8)
            const isCloud = record.provider === -1;
            const terminalStatuses = [0, 6, 7, 8];
            if (isCloud) {
              if (record.status !== undefined && terminalStatuses.includes(record.status)) {
                return (
                  <Text
                    type="danger"
                    style={{ cursor: "pointer" }}
                    onClick={() => record.id && handleDeleteTask(record.id, true)}
                  >
                    {t('actions.delete')}
                  </Text>
                );
              }
              return null;
            }
            // 本地任务删除
            if (record.status === 0 || (record.status && record.status >= 6)) {
              return (
                <Text
                  type="danger"
                  style={{ cursor: "pointer" }}
                  onClick={() => record.id && handleDeleteTask(record.id, false)}
                >
                  {t('actions.delete')}
                </Text>
              );
            }
          })()}
        </Space>
      ),
    },
  ];

  return (
    <Table
      loading={loading}
      columns={columns}
      dataSource={data}
      rowKey="id"
      pagination={{
        ...pagination,
        position: ["bottomCenter"],
      }}
      onChange={handleTableChange}
    />
  );
};

export default List;
