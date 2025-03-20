import React from 'react';
import { Progress, Space, Table, Tooltip, Typography, Tag } from 'antd';
import { FilePdfOutlined, FilePdfTwoTone } from '@ant-design/icons';

const { Text } = Typography;

const data = [
  {
    filename: 'some name for the cardsome name for the cardsome name for the cardsome name for the card.pdf',
    pages: 10,
    model: 'Claude 3.7 Sonnet | Openrouter',
    status: 'success',
    action: '取消',
    progress: '70',
    createdAt: '2024-01-01 12:00:00',
  },
  {
    filename: 'some name for the card.pdf',
    pages: 10,
    model: 'Claude 3.7 Sonnet | Openrouter',
    status: 'success',
    action: '查看',
    progress: '100',
    createdAt: '2024-01-01 12:00:00',
  },
  {
    filename: 'some name for the card.pdf',
    pages: 10,
    model: 'Claude 3.7 Sonnet | Openrouter',
    status: 'success',
    action: '取消',
    progress: '0',
    createdAt: '2024-01-01 12:00:00',
  },
];

const List: React.FC = () => {
  const columns = [
    {
      title: '文件',
      dataIndex: 'filename',
      width: 280,
      render: (text: string, record: any) => <Space style={{ maxWidth:"280px", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><FilePdfTwoTone twoToneColor="#ec5f4a" /><Tooltip title={text}><Text strong>[{record.pages}页]{text}</Text></Tooltip></Space>,
    },
    {
      title: '模型',
      dataIndex: 'model',
      width: 240,
      render: (text: string) => <Text>{text}</Text>,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      render: (text: string) => <Progress style={{ minWidth: '120px' }} status="normal" strokeColor={{ from: '#108ee9', to: '#87d068' }} percent={parseInt(text)} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (text: string) => <Tag color={text === 'success' ? 'success' : 'default'}>{text}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 160,
      render: (text: string) => <Space size="small"><a>{text}</a><Text type="danger">删除</Text></Space>,
    },
  ];
  return (
    <Table
      columns={columns}
      dataSource={data}
    />
  );
};

export default List; 