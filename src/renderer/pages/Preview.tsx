import {
  ArrowLeftOutlined,
  FileMarkdownOutlined,
  FilePdfTwoTone,
} from "@ant-design/icons";
import {
  App,
  Button,
  Pagination,
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

  return (
    <App>
      <div
        style={{
          height: "calc(100vh - 114px)",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button
            onClick={() => navigate("/list")}
            icon={<ArrowLeftOutlined />}
            color="default"
            variant="filled"
          >
            {t('preview.back')}
          </Button>

          <Space
            style={{
              maxWidth: "580px",
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
                src={`local-file://${taskDetail.imagePath}`}
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
          <Splitter.Panel>
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
