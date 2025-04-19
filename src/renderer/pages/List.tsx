import React, { useEffect, useState } from 'react';
import { Progress, Space, Table, Tooltip, Typography, Tag, App } from 'antd';
import { FilePdfTwoTone, FileImageTwoTone, FileTwoTone, FileWordTwoTone, FilePptTwoTone, FileExcelTwoTone } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Task } from '../../server/types/Task';
const { Text } = Typography;

const List: React.FC = () => {
  const { message } = App.useApp();
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
  }, []);

  const handleTableChange = (newPagination: any) => {
    fetchTasks(newPagination.current, newPagination.pageSize);
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 0: return '待处理';
      case 1: return '处理中';
      case 2: return '已完成';
      case -1: return '失败';
      default: return '未知';
    }
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 0: return 'default';
      case 1: return 'processing';
      case 2: return 'success';
      case -1: return 'error';
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
      render: (text: string, record: Task) => (
        <Space size="small">
          <Link to={`/list/preview/${record.id}`}>{record.progress === 100 ? '查看' : '取消'}</Link>
          <Text type="danger" style={{ cursor: 'pointer' }}>删除</Text>
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