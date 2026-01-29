import React, { useContext, useEffect, useState } from 'react';
import { Card, Button, Avatar, Typography, Divider, Row, Col, Statistic, Alert, Table, Tag, Tooltip, Space } from 'antd';
import { UserOutlined, LogoutOutlined, CrownOutlined, SafetyCertificateOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { CloudContext, CreditHistoryItem } from '../contexts/CloudContextDefinition';

const { Title, Text } = Typography;

const AccountCenter: React.FC = () => {
  const context = useContext(CloudContext);
  const [history, setHistory] = useState<CreditHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 5, total: 0 });

  const fetchHistory = async (page: number = 1) => {
    if (!context || !context.isAuthenticated) return;
    setLoadingHistory(true);
    try {
      const result = await context.getCreditHistory(page, pagination.pageSize);
      if (result.success && result.data) {
        setHistory(result.data);
        setPagination(prev => ({ ...prev, current: page, total: result.total || 0 }));
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (context?.isAuthenticated) {
      fetchHistory();
    }
  }, [context?.isAuthenticated]);

  if (!context) return null;

  const { user, credits, isAuthenticated, login, logout, isLoading } = context;

  if (isLoading) {
    return <Card loading bordered={false} />;
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Title level={3}>Account Center</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: '24px' }}>
          Sign in to manage your cloud account and credits.
        </Text>
        <Button type="primary" size="large" onClick={login} icon={<UserOutlined />}>
          Sign In / Sign Up
        </Button>
      </div>
    );
  }

  const columns = [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        let color = 'default';
        if (type === 'consumption') color = 'blue';
        if (type === 'recharge') color = 'green';
        if (type === 'bonus') color = 'orange';
        return <Tag color={color}>{type.toUpperCase()}</Tag>;
      },
      width: 100,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Credits',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Text type={amount > 0 ? 'success' : 'danger'} strong>
          {amount > 0 ? `+${amount}` : amount}
        </Text>
      ),
      align: 'right' as const,
      width: 100,
    },
  ];

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <Avatar size={80} src={user.imageUrl} icon={<UserOutlined />} />
        <div style={{ marginLeft: '24px', flex: 1 }}>
          <Title level={3} style={{ marginBottom: 4 }}>{user.fullName || 'User'}</Title>
          <Text type="secondary">{user.email}</Text>
        </div>
        <Button danger icon={<LogoutOutlined />} onClick={logout}>
          Sign Out
        </Button>
      </div>

      <Divider />

      <Title level={4}>Credit Balance</Title>
      <Row gutter={24}>
        <Col span={12}>
          <Card variant="borderless" style={{ background: '#e6f7ff', height: '100%' }}>
            <Statistic
              title={
                <Space>
                  Monthly Free Credits
                  <Tooltip title="日使用上限200">
                    <InfoCircleOutlined style={{ fontSize: '14px', color: 'rgba(0,0,0,0.45)' }} />
                  </Tooltip>
                </Space>
              }
              value={credits.free}
              suffix={`/ ${credits.dailyLimit}`}
              prefix={<SafetyCertificateOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>每月1日0时重置</Text>
          </Card>
        </Col>
        <Col span={12}>
          <Card variant="borderless" style={{ background: '#f9f0ff', position: 'relative', height: '100%' }}>
            <Statistic
              title="Paid Credits"
              value={credits.paid}
              prefix={<CrownOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>Never expire</Text>
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: '#722ed1' }}
                onClick={() => window.open('https://markpdfdown.com/pricing', '_blank')}
              >
                Recharge
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Divider />

      <Title level={4} style={{ marginTop: '24px', marginBottom: '16px' }}>Credit History</Title>
      <Table
        dataSource={history}
        columns={columns}
        rowKey="id"
        loading={loadingHistory}
        pagination={{
          ...pagination,
          onChange: (page) => fetchHistory(page)
        }}
        size="small"
      />
    </div>
  );
};

export default AccountCenter;
