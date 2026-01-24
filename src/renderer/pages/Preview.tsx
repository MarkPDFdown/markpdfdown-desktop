import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  FileMarkdownOutlined,
  FilePdfTwoTone,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Pagination,
  Progress,
  Space,
  Spin,
  Splitter,
  Tooltip,
  Typography,
} from "antd";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarkdownPreview from "../components/MarkdownPreview";

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

      console.log(`[Preview] Received event: ${type}`, { taskId, task: updatedTask });

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

  // 加载任务元数据
  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // 加载页面详情
  useEffect(() => {
    if (task && task.pages > 0) {
      fetchPageDetail(currentPage);
    }
  }, [currentPage, task, fetchPageDetail]);

  // 检查任务状态
  useEffect(() => {
    if (task && task.status < 2) {
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
      title: '确认删除',
      content: '确定要删除此任务吗?此操作不可恢复。',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const result = await window.api.task.delete(id);

          if (result.success) {
            message.success('删除成功');
            navigate('/list');
          } else {
            message.error(result.error || '删除失败');
          }
        } catch (error) {
          console.error('删除失败:', error);
          message.error('删除失败');
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
    const iconStyle = { fontSize: 20 };
    // PageStatus: FAILED = -1, PENDING = 0, PROCESSING = 1, COMPLETED = 2, RETRYING = 3
    switch (status) {
      case -1: // FAILED
        return {
          icon: <CloseCircleFilled style={{ ...iconStyle, color: '#ff4d4f' }} />,
          text: t('preview.status.failed'),
        };
      case 0: // PENDING
        return {
          icon: <ClockCircleFilled style={{ ...iconStyle, color: '#faad14' }} />,
          text: t('preview.status.pending'),
        };
      case 1: // PROCESSING
        return {
          icon: <LoadingOutlined style={{ ...iconStyle, color: '#1890ff' }} spin />,
          text: t('preview.status.processing'),
        };
      case 2: // COMPLETED
        return {
          icon: <CheckCircleFilled style={{ ...iconStyle, color: '#52c41a' }} />,
          text: t('preview.status.completed'),
        };
      case 3: // RETRYING
        return {
          icon: <LoadingOutlined style={{ ...iconStyle, color: '#faad14' }} spin />,
          text: t('preview.status.retrying'),
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
            <Button
              color="primary"
              icon={<FileMarkdownOutlined />}
              variant="filled"
              onClick={handleDownload}
              disabled={!task?.merged_path || task?.status !== 6}
            >
              {t('preview.download')}
            </Button>
            <Button
              color="danger"
              variant="filled"
              onClick={handleDelete}
            >
              {t('preview.delete')}
            </Button>
          </Space>
        </div>

        {/* Split View */}
        <Splitter
          style={{
            flex: 1,
            width: "100%",
            height: "calc(100vh - 224px)",
            border: "2px solid rgba(0, 0, 0, 0.05)",
          }}
        >
          {/* Image Panel */}
          <Splitter.Panel
            defaultSize="40%"
            min="30%"
            max="70%"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "12px",
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
          </Splitter.Panel>

          {/* Markdown Panel */}
          <Splitter.Panel style={{ position: 'relative' }}>
            <MarkdownPreview content={taskDetail?.content || ''} />
            {/* 悬浮操作按钮 */}
            {pageStatusInfo && !loading && (
              <Tooltip
                title={
                  <span>
                    {pageStatusInfo.text}
                    {(taskDetail?.status === -1 || taskDetail?.status === 2) && (
                      <span style={{ opacity: 0.7 }}> · {t('preview.regenerate')}</span>
                    )}
                  </span>
                }
                placement="left"
              >
                <Button
                  type="text"
                  shape="circle"
                  icon={
                    retrying ? (
                      <LoadingOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                    ) : (
                      pageStatusInfo.icon
                    )
                  }
                  onClick={handleRetryPage}
                  disabled={!taskDetail?.id || retrying}
                  style={{
                    position: 'absolute',
                    bottom: 20,
                    right: 20,
                    width: 44,
                    height: 44,
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                    border: 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
              </Tooltip>
            )}
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
