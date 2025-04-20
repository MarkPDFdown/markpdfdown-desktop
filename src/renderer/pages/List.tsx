import React, { useEffect, useState } from 'react';
import { Progress, Space, Table, Tooltip, Typography, Tag, App } from 'antd';
import { FilePdfTwoTone, FileImageTwoTone, FileTwoTone, FileWordTwoTone, FilePptTwoTone, FileExcelTwoTone } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Task } from '../../server/types/Task';
const { Text } = Typography;

const List: React.FC = () => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 获取后端服务端口
  const backendPort = window.electron?.backendPort || 3000;
  const baseURL = `http://localhost:${backendPort}`;

  const fetchTasks = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const response = await axios.get(`${baseURL}/api/tasks`, {
        params: { page, pageSize }
      });

      // 格式化任务数据
      const formattedData = response.data.list.map((task: any) => ({
        ...task,
        model: `${task.model_name} | ${task.model}`,
        action: task.progress === 100 ? '查看' : '取消',
      }));

      setData(formattedData);
      setPagination({
        ...pagination,
        current: page,
        total: response.data.total,
      });
    } catch (error) {
      console.error('获取任务列表失败:', error);
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks(pagination.current, pagination.pageSize);
    
    // 设置定时器，每10秒获取一次任务列表
    const timer = setInterval(() => {
      fetchTasks(pagination.current, pagination.pageSize);
    }, 10000);
    
    // 组件卸载时清除定时器
    return () => {
      clearInterval(timer);
    };
  }, [pagination.current, pagination.pageSize]);

  const handleTableChange = (newPagination: any) => {
    fetchTasks(newPagination.current, newPagination.pageSize);
  };

  // 删除任务
  const handleDeleteTask = async (id: string) => {
    modal.confirm({
      title: '确认删除',
      content: '确定要删除这个任务吗？此操作不可逆。',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.delete(`${baseURL}/api/tasks/${id}`);
          message.success('删除成功');
          fetchTasks(pagination.current, pagination.pageSize);
        } catch (error) {
          console.error('删除任务失败:', error);
          message.error('删除任务失败');
        }
      }
    });
  };

  // 更新任务状态
  const handleUpdateTaskStatus = async (id: string, status: number, statusText: string) => {
    modal.confirm({
      title: `确认${statusText}`,
      content: `确定要${statusText}这个任务吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.put(`${baseURL}/api/tasks/${id}`, { status });
          message.success(`${statusText}成功`);
          fetchTasks(pagination.current, pagination.pageSize);
        } catch (error) {
          console.error(`${statusText}任务失败:`, error);
          message.error(`${statusText}失败`);
        }
      }
    });
  };

  // 重试任务
  const handleRetryTask = (id: string) => {
    handleUpdateTaskStatus(id, 1, '重试');
  };

  // 取消任务
  const handleCancelTask = (id: string) => {
    handleUpdateTaskStatus(id, 6, '取消');
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1: return '待处理'; // action: 取消
      case 2: return '处理中'; // action: 查看，取消
      case 3: return '待合并'; // action: 查看，取消
      case 4: return '合并中'; // action: 查看，取消
      case 5: return '已完成'; // action: 查看，删除
      case 6: return '已取消'; // action: 删除
      case 0: return '失败'; // action: 重试，删除
      default: return '未知'; // action: 删除
    }
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 1: return 'default';
      case 2: return 'processing';
      case 3: return 'processing';
      case 4: return 'processing';
      case 5: return 'success';
      case 6: return 'default';
      case 0: return 'error';
      default: return 'default';
    }
  };

  const columns = [
    {
      title: '文件',
      dataIndex: 'filename',
      width: 280,
      render: (text: string, record: Task) => (
        <Space style={{ maxWidth: "280px", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(() => {
            const fileType = (record.type || '').toLowerCase();
            if (fileType === 'pdf') {
              return <FilePdfTwoTone twoToneColor="#ec5f4a" />;
            } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileType)) {
              return <FileImageTwoTone twoToneColor="#52c41a" />;
            } else if (['doc', 'docx'].includes(fileType)) {
              return <FileWordTwoTone twoToneColor="#1890ff" />;
            } else if (['ppt', 'pptx'].includes(fileType)) {
              return <FilePptTwoTone twoToneColor="#fa8c16" />;
            } else if (['xls', 'xlsx'].includes(fileType)) {
              return <FileExcelTwoTone twoToneColor="#52c41a" />;
            } else {
              return <FileTwoTone />;
            }
          })()}
          <Tooltip title={text}>
            {(() => {
              if (record.pages && record.pages > 1) {
                return <Text strong>[{record.pages}页]{text}</Text>;
              } else {
                return <Text strong>{text}</Text>;
              }
            })()}
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model_name',
      width: 240,
      render: (text: string) => <Text style={{ maxWidth: "240px", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</Text>,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      render: (progress: number) => (
        <Progress
          style={{ minWidth: '120px' }}
          status="normal"
          strokeColor={{ from: '#108ee9', to: '#87d068' }}
          percent={progress}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      ),
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 160,
      render: (_text: string, record: Task) => (
        <Space size="small">
          {(() => {
            if (record.status && record.status > 1 && record.status < 6) {
              return <Link type="success" to={`/list/preview/${record.id}`}>查看</Link>;
            }
          })()}
          {(() => {
            if (record.status && record.status > 0 && record.status < 5) {
              return <Text type="secondary" style={{ cursor: 'pointer' }} onClick={() => record.id && handleCancelTask(record.id)}>取消</Text>
            }
          })()}
          {(() => {
            if (record.status === 0) {
              return <Text type="warning" style={{ cursor: 'pointer' }} onClick={() => record.id && handleRetryTask(record.id)}>重试</Text>
            }
          })()}
          {(() => {
            if ((record.status === 0) || (record.status && record.status >= 5)) {
              return <Text type="danger" style={{ cursor: 'pointer' }} onClick={() => record.id && handleDeleteTask(record.id)}>
                删除
              </Text>
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
        position: ['bottomCenter'],
      }}
      onChange={handleTableChange}
    />
  );
};

export default List; 