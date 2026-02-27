import React, { useContext, useEffect, useState } from 'react';
import { Card, Button, Avatar, Typography, Divider, Row, Col, Statistic, Table, Tag, Tooltip, Space, Alert, Flex } from 'antd';
import { UserOutlined, LogoutOutlined, CrownOutlined, SafetyCertificateOutlined, InfoCircleOutlined, LoadingOutlined, CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CloudContext, CreditHistoryItem } from '../contexts/CloudContextDefinition';

const { Title, Text } = Typography;

const AccountCenter: React.FC = () => {
  const { t } = useTranslation('account');
  const context = useContext(CloudContext);
  const [history, setHistory] = useState<CreditHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 5, total: 0 });
  const [codeCopied, setCodeCopied] = useState(false);

  const fetchHistory = async (page: number = 1) => {
    if (!context || !context.isAuthenticated) return;
    setLoadingHistory(true);
    try {
      const result = await context.getCreditHistory(page, pagination.pageSize);
      if (result.success && result.data) {
        setHistory(result.data);
        setPagination(prev => ({ ...prev, current: page, total: result.pagination?.total || 0 }));
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (context?.isAuthenticated) {
      context.refreshCredits();
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.isAuthenticated]);

  if (!context) return null;

  const { user, credits, isAuthenticated, login, logout, isLoading, deviceFlowStatus, userCode, authError, cancelLogin } = context;

  if (isLoading) {
    return <Card loading bordered={false} />;
  }

  // Handle copy user code
  const handleCopyCode = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode).then(() => {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      });
    }
  };

  if (!isAuthenticated) {
    // Device flow: pending_browser or polling
    if (deviceFlowStatus === 'pending_browser' || deviceFlowStatus === 'polling') {
      return (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Title level={3}>{t('title')}</Title>
          <div style={{ marginBottom: '24px' }}>
            <LoadingOutlined style={{ fontSize: '24px', marginBottom: '16px' }} />
            <div style={{ marginBottom: '16px' }}>
              <Text type="secondary">{t('device_flow.enter_code_hint')}</Text>
            </div>
            {userCode && (
              <div style={{ marginBottom: '16px' }}>
                <Space>
                  <Text
                    strong
                    style={{ fontSize: '32px', letterSpacing: '4px', fontFamily: 'monospace' }}
                  >
                    {userCode}
                  </Text>
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={handleCopyCode}
                    size="small"
                  >
                    {codeCopied ? '✓' : ''}
                  </Button>
                </Space>
              </div>
            )}
            <Text type="secondary">{t('device_flow.waiting')}</Text>
          </div>
          <Button onClick={cancelLogin}>{t('device_flow.cancel')}</Button>
        </div>
      );
    }

    // Device flow: expired
    if (deviceFlowStatus === 'expired') {
      return (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Title level={3}>{t('title')}</Title>
          <Alert
            message={t('device_flow.expired')}
            type="warning"
            showIcon
            style={{ marginBottom: '24px', textAlign: 'left' }}
          />
          <Button type="primary" size="large" onClick={login} icon={<UserOutlined />}>
            {t('device_flow.try_again')}
          </Button>
        </div>
      );
    }

    // Device flow: error
    if (deviceFlowStatus === 'error') {
      return (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Title level={3}>{t('title')}</Title>
          <Alert
            message={authError || 'Login failed'}
            type="error"
            showIcon
            style={{ marginBottom: '24px', textAlign: 'left' }}
          />
          <Button type="primary" size="large" onClick={login} icon={<UserOutlined />}>
            {t('device_flow.try_again')}
          </Button>
        </div>
      );
    }

    // Default: idle - show login button
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Title level={3}>{t('title')}</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: '24px' }}>
          {t('sign_in_hint')}
        </Text>
        <Button type="primary" size="large" onClick={login} icon={<UserOutlined />}>
          {t('sign_in_button')}
        </Button>
      </div>
    );
  }

  const typeColorMap: Record<string, string> = {
    consume: 'blue',
    pre_auth: 'geekblue',
    settle: 'blue',
    pre_auth_release: 'cyan',
    topup: 'green',
    refund: 'orange',
    bonus_grant: 'cyan',
    bonus_expire: 'red',
  };

  const getTypeLabel = (type: string, typeName?: string) => {
    const i18nKey = `history.types.${type}`;
    const translated = t(i18nKey);
    // If i18next returns the key itself (no translation found), fall back to server-provided typeName
    if (translated === i18nKey && typeName) {
      return typeName;
    }
    return translated !== i18nKey ? translated : type;
  };

  const columns = [
    {
      title: t('history.columns.time'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => {
        if (!text) return '-';
        const date = new Date(text);
        return isNaN(date.getTime()) ? text : date.toLocaleString();
      },
    },
    {
      title: t('history.columns.type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string, record: CreditHistoryItem) => {
        const color = typeColorMap[type] || 'default';
        return <Tag color={color}>{getTypeLabel(type, record.typeName)}</Tag>;
      },
      width: 120,
    },
    {
      title: t('history.columns.credits'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: CreditHistoryItem) => {
        const isSettle = record.type === 'pre_auth' || record.type === 'pre_auth_release';
        return (
          <Text type={isSettle ? 'secondary' : amount > 0 ? 'success' : 'danger'} strong={!isSettle}>
            {amount > 0 ? `+${amount}` : amount}
          </Text>
        );
      },
      align: 'right' as const,
      width: 100,
    },
    {
      title: t('history.columns.description'),
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => {
        return text || '-';
      },
    },
  ];

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <Avatar size={80} src={user.avatarUrl} icon={<UserOutlined />} />
        <div style={{ marginLeft: '24px', flex: 1 }}>
          <Title level={3} style={{ marginBottom: 4 }}>{user.name || 'User'}</Title>
          <Text type="secondary">{user.email}</Text>
        </div>
        <Button danger icon={<LogoutOutlined />} onClick={logout}>
          {t('sign_out_button')}
        </Button>
      </div>

      <Divider />

      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{t('credit_balance')}</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('credit_usage_hint')}
        </Text>
      </Flex>
      <Row gutter={24}>
        <Col span={12}>
          <Card variant="borderless" style={{ background: '#e6f7ff', height: '100%' }}>
            <Space>
              {t('monthly_free.title')}
              <Tooltip title={t('monthly_free.daily_limit_tooltip', { limit: credits.dailyLimit })}>
                <InfoCircleOutlined style={{ fontSize: '14px', color: 'rgba(0,0,0,0.45)' }} />
              </Tooltip>
            </Space>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: '12px' }}>{t('monthly_free.monthly_label')}</Text>}
                  value={credits.bonusBalance}
                  prefix={<SafetyCertificateOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: '12px' }}>{t('monthly_free.daily_label')}</Text>}
                  value={credits.free}
                  suffix={`/ ${credits.dailyLimit}`}
                  valueStyle={{ color: '#1890ff', fontSize: '20px' }}
                />
              </Col>
            </Row>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>{t('monthly_free.description')}</Text>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card variant="borderless" style={{ background: '#f9f0ff', position: 'relative', height: '100%' }}>
            <Statistic
              title={t('paid_credits.title')}
              value={credits.paid}
              prefix={<CrownOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>{t('paid_credits.description')}</Text>
              <Button
                type="primary"
                size="small"
                style={{ backgroundColor: '#722ed1' }}
                onClick={() => window.open('https://markpdfdown.com/pricing', '_blank')}
              >
                {t('paid_credits.recharge')}
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Divider />

      <Title level={4} style={{ marginTop: '24px', marginBottom: '16px' }}>{t('history.title')}</Title>
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
