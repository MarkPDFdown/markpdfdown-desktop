import React, { useEffect, useState, useCallback, useRef } from "react";
import { Progress, Space, Table, Tooltip, Typography, Tag, App } from "antd";
import {
  FilePdfTwoTone,
  FileImageTwoTone,
  FileTwoTone,
  FileWordTwoTone,
  FilePptTwoTone,
  FileExcelTwoTone,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Task } from "../../server/types/Task";
const { Text } = Typography;

const List: React.FC = () => {
  const { message, modal } = App.useApp();
  const { t } = useTranslation('list');
  const { t: tCommon } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 使用 ref 存储 pagination，避免 useEffect 无限循环
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;

  const fetchTasks = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const result = await window.api.task.getAll({ page, pageSize });

      if (result.success && result.data) {
        setData(result.data.list);
        setPagination(prev => ({
          ...prev,
          current: page,
          total: result.data.total,
        }));
      } else {
        message.error(result.error || t('messages.fetch_failed'));
      }
    } catch (error) {
      console.error("获取任务列表失败:", error);
      message.error(t('messages.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
  }, [fetchTasks]);

  useEffect(() => {
    // 设置定时器，每10秒获取一次任务列表
    const timer = setInterval(() => {
      fetchTasks(paginationRef.current.current, paginationRef.current.pageSize);
    }, 10000);

    // 组件卸载时清除定时器
    return () => {
      clearInterval(timer);
    };
  }, [fetchTasks]);

  const handleTableChange = (newPagination: any) => {
    fetchTasks(newPagination.current, newPagination.pageSize);
  };

  // 删除任务
  const handleDeleteTask = async (id: string) => {
    modal.confirm({
      title: t('confirmations.delete_title'),
      content: t('confirmations.delete_content'),
      okText: t('confirmations.ok'),
      cancelText: t('confirmations.cancel'),
      onOk: async () => {
        try {
          const result = await window.api.task.delete(id);
          if (result.success) {
            message.success(t('messages.delete_success'));
            fetchTasks(pagination.current, pagination.pageSize);
          } else {
            message.error(result.error || t('messages.delete_failed'));
          }
        } catch (error) {
          console.error("删除任务失败:", error);
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
          console.error(`${statusText}任务失败:`, error);
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
      render: (status: number) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      ),
    },
    {
      title: t('columns.action'),
      dataIndex: "action",
      width: 160,
      render: (_text: string, record: Task) => (
        <Space size="small">
          {(() => {
            if (record.status && record.status > 1 && record.status < 7) {
              return (
                <Link type="success" to={`/list/preview/${record.id}`}>
                  {t('actions.view')}
                </Link>
              );
            }
          })()}
          {(() => {
            if (record.status && record.status > 0 && record.status < 6) {
              return (
                <Text
                  type="secondary"
                  style={{ cursor: "pointer" }}
                  onClick={() => record.id && handleCancelTask(record.id)}
                >
                  {t('actions.cancel')}
                </Text>
              );
            }
          })()}
          {(() => {
            if (record.status === 0) {
              return (
                <Text
                  type="warning"
                  style={{ cursor: "pointer" }}
                  onClick={() => record.id && handleRetryTask(record.id)}
                >
                  {t('actions.retry')}
                </Text>
              );
            }
          })()}
          {(() => {
            if (record.status === 0 || (record.status && record.status >= 6)) {
              return (
                <Text
                  type="danger"
                  style={{ cursor: "pointer" }}
                  onClick={() => record.id && handleDeleteTask(record.id)}
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
