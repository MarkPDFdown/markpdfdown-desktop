import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  DeleteOutlined,
  DownOutlined,
  FileMarkdownOutlined,
  FilePdfTwoTone,
  LoadingOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Dropdown,
  Pagination,
  Progress,
  Space,
  Spin,
  Splitter,
  Tooltip,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarkdownPreview from "../components/MarkdownPreview";
import { Task } from "../../shared/types";

// Types for task events
interface TaskDetailWithImage {
  id: number;
  task: string;
  page: number;
  page_source: number;
  status: number;
  worker_id?: string | null;
  provider: number;
  model: string;
  content: string;
  error?: string | null;
  retry_count: number;
  createdAt: Date;
  updatedAt: Date;
  imagePath: string;
  imageExists: boolean;
}

interface TaskEvent {
  type: string;
  taskId: string;
  task?: Partial<Task>;
  timestamp: number;
}

interface TaskDetailEvent {
  type: string;
  taskId: string;
  pageId: number;
  page: number;
  status: number;
  timestamp: number;
}

const { Text } = Typography;

const Preview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');

  // State
  const [task, setTask] = useState<Task | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetailWithImage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);

  // 获取任务元数据
  const fetchTask = useCallback(async () => {
    if (!id) return;

    try {
      const result = await window.api.task.getById(id);

      if (result.success && result.data) {
        setTask(result.data);
      } else {
        message.error(result.error || '获取任务信息失败');
        navigate('/list');
      }
    } catch (error) {
      console.error('获取任务失败:', error);
      message.error('获取任务信息失败');
      navigate('/list');
    }
  }, [id, message, navigate]);

  // 获取页面详情
  const fetchPageDetail = useCallback(async (page: number) => {
    if (!id) return;

    setLoading(true);
    setImageError(false);

    try {
      const result = await window.api.taskDetail.getByPage(id, page);

      if (result.success && result.data) {
        setTaskDetail(result.data);
        setImageError(!result.data.imageExists);
      } else {
        message.error(result.error || '获取页面详情失败');
        setTaskDetail(null);
      }
    } catch (error) {
      console.error('获取页面详情失败:', error);
      message.error('获取页面详情失败');
      setTaskDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  // 监听任务事件
  useEffect(() => {
    if (!id) return;

    const handleTaskEvent = (event: TaskEvent) => {
      const { type, taskId, task: updatedTask } = event;

      if (taskId !== id) return;

      console.log(`[Preview] Received task event: ${type}`, { taskId, task: updatedTask });

      switch (type) {
        case 'task:updated':
        case 'task:status_changed':
        case 'task:progress_changed':
          if (updatedTask) {
            setTask(prev => prev ? { ...prev, ...updatedTask } : null);
          }
          break;

        case 'task:deleted':
          message.info('任务已被删除');
          navigate('/list');
          break;
      }
    };

    const cleanup = window.api.events.onTaskEvent(handleTaskEvent);

    return () => {
      cleanup();
    };
  }, [id, message, navigate]);

  // 监听页面详情事件
  useEffect(() => {
    if (!id) return;

    const handleTaskDetailEvent = (event: TaskDetailEvent) => {
      const { taskId, page, status } = event;

      if (taskId !== id) return;

      console.log(`[Preview] Received taskDetail event: page ${page} -> status ${status}`);

      // 如果是当前显示的页面，更新状态
      if (page === currentPage) {
        setTaskDetail(prev => prev ? { ...prev, status } : null);
      }
    };

    const cleanup = window.api.events.onTaskDetailEvent(handleTaskDetailEvent);

    return () => {
      cleanup();
    };
  }, [id, currentPage]);

  // 加载任务元数据
  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // 加载页面详情
  useEffect(() => {
    if (task && task.pages && task.pages > 0) {
      fetchPageDetail(currentPage);
    }
  }, [currentPage, task, fetchPageDetail]);

  // 检查任务状态
  useEffect(() => {
    if (task && task.status !== undefined && task.status < 2) {
      message.warning('任务尚未开始处理,无法预览');
      navigate('/list');
    }
  }, [task, message, navigate]);

  // 下载处理
  const handleDownload = async () => {
    if (!id) return;

    try {
      const result = await window.api.file.downloadMarkdown(id);

      if (result.success) {
        message.success('下载成功');
      } else {
        message.error(result.error || '下载失败');
      }
    } catch (error) {
      console.error('下载失败:', error);
      message.error('下载失败');
    }
  };

  // 删除处理
  const handleDelete = async () => {
    if (!id) return;

    modal.confirm({
      title: t('preview.confirm_delete'),
      content: t('preview.confirm_delete_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await window.api.task.delete(id);

          if (result.success) {
            message.success(t('preview.delete_success'));
            navigate('/list');
          } else {
            message.error(result.error || t('preview.delete_failed'));
          }
        } catch (error) {
          console.error('删除失败:', error);
          message.error(t('preview.delete_failed'));
        }
      }
    });
  };

  // 取消任务
  const handleCancel = async () => {
    if (!id) return;

    modal.confirm({
      title: t('preview.confirm_cancel'),
      content: t('preview.confirm_cancel_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        try {
          const result = await window.api.task.update(id, { status: 7 }); // CANCELLED = 7

          if (result.success) {
            message.success(t('preview.cancel_success'));
            navigate('/list');
          } else {
            message.error(result.error || t('preview.cancel_failed'));
          }
        } catch (error) {
          console.error('取消失败:', error);
          message.error(t('preview.cancel_failed'));
        }
      }
    });
  };

  // 重试任务（全部重试）
  const handleRetryTask = async () => {
    if (!id) return;

    modal.confirm({
      title: t('preview.confirm_retry'),
      content: t('preview.confirm_retry_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        try {
          const result = await window.api.task.update(id, { status: 1 }); // PENDING = 1

          if (result.success) {
            message.success(t('preview.retry_success'));
          } else {
            message.error(result.error || t('preview.retry_failed'));
          }
        } catch (error) {
          console.error('重试失败:', error);
          message.error(t('preview.retry_failed'));
        }
      }
    });
  };

  // 重试失败页
  const handleRetryFailed = async () => {
    if (!id) return;

    modal.confirm({
      title: t('preview.confirm_retry_failed'),
      content: t('preview.confirm_retry_failed_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        setRetryingFailed(true);
        try {
          const result = await window.api.taskDetail.retryFailed(id);

          if (result.success) {
            message.success(t('preview.retry_failed_success', { count: result.data?.retried || 0 }));
          } else {
            message.error(result.error || t('preview.retry_failed'));
          }
        } catch (error) {
          console.error('重试失败页失败:', error);
          message.error(t('preview.retry_failed'));
        } finally {
          setRetryingFailed(false);
        }
      }
    });
  };

  // 分页处理
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // 重试当前页
  const handleRetryPage = async () => {
    if (!taskDetail?.id) return;

    setRetrying(true);
    try {
      const result = await window.api.taskDetail.retry(taskDetail.id);

      if (result.success) {
        message.success('页面已加入重试队列');
        // 重新获取页面详情
        fetchPageDetail(currentPage);
      } else {
        message.error(result.error || '重试失败');
      }
    } catch (error) {
      console.error('重试页面失败:', error);
      message.error('重试失败');
    } finally {
      setRetrying(false);
    }
  };

  // 获取页面状态信息
  const getPageStatusInfo = () => {
    const status = taskDetail?.status;
    const iconStyle = { fontSize: 14 };
    // PageStatus: FAILED = -1, PENDING = 0, PROCESSING = 1, COMPLETED = 2, RETRYING = 3
    switch (status) {
      case -1: // FAILED
        return {
          icon: <CloseCircleFilled style={{ ...iconStyle, color: '#ff4d4f' }} />,
          text: t('preview.status.failed'),
          color: '#ff4d4f',
        };
      case 0: // PENDING
        return {
          icon: <ClockCircleFilled style={{ ...iconStyle, color: '#faad14' }} />,
          text: t('preview.status.pending'),
          color: '#faad14',
        };
      case 1: // PROCESSING
        return {
          icon: <LoadingOutlined style={{ ...iconStyle, color: '#1890ff' }} spin />,
          text: t('preview.status.processing'),
          color: '#1890ff',
        };
      case 2: // COMPLETED
        return {
          icon: <CheckCircleFilled style={{ ...iconStyle, color: '#52c41a' }} />,
          text: t('preview.status.completed'),
          color: '#52c41a',
        };
      case 3: // RETRYING
        return {
          icon: <LoadingOutlined style={{ ...iconStyle, color: '#faad14' }} spin />,
          text: t('preview.status.retrying'),
          color: '#faad14',
        };
      default:
        return null;
    }
  };

  const pageStatusInfo = getPageStatusInfo();

  return (
    <App>
      <div
        style={{
          height: "calc(100vh - 114px)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button
            onClick={() => navigate("/list")}
            icon={<ArrowLeftOutlined />}
            color="default"
            variant="filled"
          >
            {t('preview.back')}
          </Button>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", width: "200px" }}>
            <Space
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <FilePdfTwoTone twoToneColor="#ec5f4a" />
              <Tooltip title={task?.filename || ''}>
                <Text strong>
                  [{tCommon('common.pages', { count: task?.pages || 0 })}]{task?.filename || ''}
                </Text>
              </Tooltip>
            </Space>

            {/* Mini Progress Bar */}
            {task && (
              <Progress
                percent={task.progress || 0}
                size="small"
                status={task.status === 6 ? 'success' : task.status === 4 ? 'exception' : 'active'}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
                showInfo={false}
                style={{ width: "100%" }}
              />
            )}
          </div>

          <Space>
            {/* 下载: 始终显示，但仅在 COMPLETED(6) 且有 merged_path 时启用 */}
            <Button
              color="primary"
              icon={<FileMarkdownOutlined />}
              variant="filled"
              onClick={handleDownload}
              disabled={!task?.merged_path || task?.status !== 6}
            >
              {t('preview.download')}
            </Button>
            {/* 操作下拉菜单 */}
            {(() => {
              const status = task?.status;
              const failedCount = task?.failed_count || 0;

              // 构建菜单项
              const menuItems: MenuProps['items'] = [];

              // 重试失败页: status === 8 && failed_count > 0
              if (status === 8 && failedCount > 0) {
                menuItems.push({
                  key: 'retry_failed',
                  icon: <ReloadOutlined />,
                  label: t('preview.retry_failed'),
                  onClick: handleRetryFailed,
                  disabled: retryingFailed,
                });
              }

              // 全部重试: status === 0
              if (status === 0) {
                menuItems.push({
                  key: 'retry_all',
                  icon: <ReloadOutlined />,
                  label: t('preview.retry_all'),
                  onClick: handleRetryTask,
                });
              }

              // 分隔线
              if (menuItems.length > 0 && ((status !== undefined && status > 0 && status < 6) || status === 0 || (status !== undefined && status >= 6))) {
                menuItems.push({ type: 'divider' });
              }

              // 取消: status > 0 && status < 6
              if (status !== undefined && status > 0 && status < 6) {
                menuItems.push({
                  key: 'cancel',
                  icon: <StopOutlined />,
                  label: t('preview.cancel'),
                  onClick: handleCancel,
                });
              }

              // 删除: status === 0 || status >= 6
              if (status === 0 || (status !== undefined && status >= 6)) {
                menuItems.push({
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: t('preview.delete'),
                  danger: true,
                  onClick: handleDelete,
                });
              }

              // 如果没有菜单项，不显示下拉按钮
              if (menuItems.length === 0) return null;

              // 判断是否有主要操作（重试失败页或全部重试）
              const hasRetryFailed = status === 8 && failedCount > 0;
              const hasRetryAll = status === 0;
              const hasPrimaryAction = hasRetryFailed || hasRetryAll;

              if (hasPrimaryAction) {
                // 有主要操作时，使用 Dropdown.Button
                const primaryLabel = hasRetryFailed ? t('preview.retry_failed') : t('preview.retry_all');
                const primaryAction = hasRetryFailed ? handleRetryFailed : handleRetryTask;
                const primaryIcon = hasRetryFailed && retryingFailed ? <LoadingOutlined /> : <ReloadOutlined />;

                // 过滤掉主按钮对应的菜单项，避免重复
                const filteredMenuItems = menuItems.filter(item => {
                  if (!item || item.type === 'divider') return true;
                  if (hasRetryFailed && (item as any).key === 'retry_failed') return false;
                  if (hasRetryAll && (item as any).key === 'retry_all') return false;
                  return true;
                });

                // 移除开头的分隔线
                while (filteredMenuItems.length > 0 && filteredMenuItems[0]?.type === 'divider') {
                  filteredMenuItems.shift();
                }

                return (
                  <Dropdown.Button
                    menu={{ items: filteredMenuItems }}
                    onClick={primaryAction}
                    icon={<DownOutlined />}
                    disabled={hasRetryFailed && retryingFailed}
                  >
                    <Space>
                      {primaryIcon}
                      {primaryLabel}
                    </Space>
                  </Dropdown.Button>
                );
              } else {
                // 没有主要操作时，使用普通 Dropdown，点击按钮即展开菜单
                return (
                  <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                    <Button>
                      {t('preview.more_actions')}
                      <DownOutlined />
                    </Button>
                  </Dropdown>
                );
              }
            })()}
          </Space>
        </div>

        {/* Split View */}
        <Splitter
          style={{
            flex: 1,
            width: "100%",
            minWidth: 0,
            height: "calc(100vh - 224px)",
            border: "2px solid rgba(0, 0, 0, 0.05)",
            overflow: "hidden",
          }}
        >
          {/* Image Panel */}
          <Splitter.Panel
            defaultSize="35%"
            min="30%"
            max="70%"
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "12px",
            }}
          >
            {/* 图片区域 */}
            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              {loading ? (
                <Spin size="large" />
              ) : imageError || !taskDetail?.imagePath ? (
                <div style={{ textAlign: 'center', color: '#999' }}>
                  <Text type="secondary">图片加载失败或不存在</Text>
                </div>
              ) : (
                <img
                  src={`local-file:///${taskDetail.imagePath.replace(/\\/g, '/')}`}
                  alt={`Page ${currentPage}`}
                  draggable={false}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                  onError={() => setImageError(true)}
                />
              )}
            </div>
            {/* 底部状态栏 */}
            {!loading && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 12,
                  borderTop: "1px solid rgba(0, 0, 0, 0.06)",
                  marginTop: 12,
                }}
              >
                {/* 状态显示 */}
                {pageStatusInfo ? (
                  taskDetail?.status === -1 && taskDetail?.error ? (
                    <Tooltip title={taskDetail.error}>
                      <Space size={6} style={{ cursor: 'help' }}>
                        {pageStatusInfo.icon}
                        <Text style={{ fontSize: 13, color: pageStatusInfo.color }}>
                          {pageStatusInfo.text}
                        </Text>
                      </Space>
                    </Tooltip>
                  ) : (
                    <Space size={6}>
                      {pageStatusInfo.icon}
                      <Text style={{ fontSize: 13, color: pageStatusInfo.color }}>
                        {pageStatusInfo.text}
                      </Text>
                    </Space>
                  )
                ) : (
                  <span />
                )}
                {/* 重新生成按钮 */}
                <Tooltip title={t('preview.regenerate_tooltip')}>
                  <Button
                    type="text"
                    size="small"
                    icon={retrying ? <LoadingOutlined /> : <ReloadOutlined />}
                    onClick={handleRetryPage}
                    disabled={!taskDetail?.id || retrying}
                    style={{ color: '#666' }}
                  >
                    {t('preview.regenerate')}
                  </Button>
                </Tooltip>
              </div>
            )}
          </Splitter.Panel>

          {/* Markdown Panel */}
          <Splitter.Panel style={{ overflow: "auto", minWidth: 0 }}>
            <MarkdownPreview content={taskDetail?.content || ''} />
          </Splitter.Panel>
        </Splitter>

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pagination
            current={currentPage}
            total={task?.pages || 0}
            pageSize={1}
            onChange={handlePageChange}
            showSizeChanger={false}
            disabled={loading}
          />
        </div>
      </div>
    </App>
  );
};

export default Preview;
