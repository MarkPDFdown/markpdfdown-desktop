import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Card, Button, Avatar, Typography, Divider, Row, Col, Statistic, Table, Tag, Tooltip, Space, Alert, Flex, message, Modal, Spin, Tabs } from 'antd';
import { UserOutlined, LogoutOutlined, CrownOutlined, SafetyCertificateOutlined, InfoCircleOutlined, LoadingOutlined, CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CheckoutStatus, CloudContext, CreditHistoryItem, PaymentHistoryItem } from '../contexts/CloudContextDefinition';

const { Title, Text } = Typography;

type PaymentDialogPhase = 'idle' | 'polling' | 'success' | 'failed';

interface PaymentDialogState {
  open: boolean;
  phase: PaymentDialogPhase;
  sessionId: string | null;
  orderId?: string;
  status?: string;
  providerStatus?: string;
  amountUsd?: number;
  creditsAdded?: number;
  createdAt?: string;
  lastError?: string;
}

const initialPaymentDialogState: PaymentDialogState = {
  open: false,
  phase: 'idle',
  sessionId: null,
};

const AccountCenter: React.FC = () => {
  const { t } = useTranslation('account');
  const context = useContext(CloudContext);
  const [creditHistory, setCreditHistory] = useState<CreditHistoryItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [loadingCreditHistory, setLoadingCreditHistory] = useState(false);
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false);
  const [creditCurrentPage, setCreditCurrentPage] = useState(1);
  const [paymentCurrentPage, setPaymentCurrentPage] = useState(1);
  const [creditTotal, setCreditTotal] = useState(0);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'credits' | 'payments'>('credits');
  const [codeCopied, setCodeCopied] = useState(false);
  const [selectedTopupAmount, setSelectedTopupAmount] = useState(20);
  const [topupLoading, setTopupLoading] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState>(initialPaymentDialogState);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const pollingActiveRef = useRef(false);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthenticatedRef = useRef(false);

  const topupOptions = [
    { amount: 5, credits: 7500 },
    { amount: 20, credits: 32000 },
    { amount: 100, credits: 180000 },
  ];

  const historyPageSize = 5;

  const fetchCreditHistory = useCallback(async (page: number = 1) => {
    if (!context || !context.isAuthenticated) return;
    setLoadingCreditHistory(true);
    try {
      const result = await context.getCreditHistory(page, historyPageSize);
      if (result.success && result.data) {
        setCreditHistory(result.data);
        setCreditCurrentPage(page);
        setCreditTotal(result.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch credit history:', error);
    } finally {
      setLoadingCreditHistory(false);
    }
  }, [context, historyPageSize]);

  const fetchPaymentHistory = useCallback(async (page: number = 1) => {
    if (!context || !context.isAuthenticated) return;
    setLoadingPaymentHistory(true);
    try {
      const result = await context.getPaymentHistory(page, historyPageSize);
      if (result.success && result.data) {
        setPaymentHistory(result.data);
        setPaymentCurrentPage(page);
        setPaymentTotal(result.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch payment history:', error);
    } finally {
      setLoadingPaymentHistory(false);
    }
  }, [context, historyPageSize]);

  const stopPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const syncCreditsAndHistory = useCallback(async () => {
    if (!context?.isAuthenticated) return;
    await context.refreshCredits();
    await Promise.all([
      fetchCreditHistory(creditCurrentPage),
      fetchPaymentHistory(paymentCurrentPage),
    ]);
  }, [context, fetchCreditHistory, fetchPaymentHistory, creditCurrentPage, paymentCurrentPage]);

  const applyFinalCheckoutStatus = useCallback(async (statusData: CheckoutStatus) => {
    const isSuccess = statusData.status === 'completed';
    stopPolling();
    setPaymentDialog(prev => ({
      ...prev,
      phase: isSuccess ? 'success' : 'failed',
      orderId: statusData.orderId,
      status: statusData.status,
      providerStatus: statusData.providerStatus,
      amountUsd: statusData.amountUsd,
      creditsAdded: statusData.creditsAdded,
      createdAt: statusData.createdAt,
      lastError: undefined,
    }));

    await syncCreditsAndHistory();
    if (isSuccess) {
      message.success(t('paid_credits.payment_success'));
    } else {
      message.error(t('paid_credits.payment_failed'));
    }
  }, [stopPolling, syncCreditsAndHistory, t]);

  const startCheckoutPolling = useCallback((sessionId: string) => {
    if (!context?.isAuthenticated) return;

    stopPolling();
    isAuthenticatedRef.current = true;
    pollingActiveRef.current = true;

    const pollOnce = async () => {
      if (!pollingActiveRef.current || !isAuthenticatedRef.current) {
        return;
      }

      const result = await context.getCheckoutStatus(sessionId, 10);
      if (!pollingActiveRef.current || !isAuthenticatedRef.current) {
        return;
      }

      if (!result.success || !result.data) {
        setPaymentDialog(prev => prev.sessionId === sessionId
          ? { ...prev, lastError: result.error || t('paid_credits.polling_failed') }
          : prev);
        if (!pollingActiveRef.current || !isAuthenticatedRef.current) {
          return;
        }
        pollingTimerRef.current = setTimeout(() => {
          void pollOnce();
        }, 1500);
        return;
      }

      const statusData = result.data;
      setPaymentDialog(prev => prev.sessionId === sessionId
        ? {
          ...prev,
          phase: statusData.isFinal
            ? (statusData.status === 'completed' ? 'success' : 'failed')
            : 'polling',
          orderId: statusData.orderId,
          status: statusData.status,
          providerStatus: statusData.providerStatus,
          amountUsd: statusData.amountUsd,
          creditsAdded: statusData.creditsAdded,
          createdAt: statusData.createdAt,
          lastError: undefined,
        }
        : prev);

      if (statusData.isFinal) {
        await applyFinalCheckoutStatus(statusData);
        return;
      }

      if (!pollingActiveRef.current || !isAuthenticatedRef.current) {
        return;
      }
      pollingTimerRef.current = setTimeout(() => {
        void pollOnce();
      }, 200);
    };

    void pollOnce();
  }, [applyFinalCheckoutStatus, context, stopPolling, t]);

  useEffect(() => {
    if (context?.isAuthenticated) {
      context.refreshCredits();
      void fetchCreditHistory();
      void fetchPaymentHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.isAuthenticated]);

  useEffect(() => {
    const authed = Boolean(context?.isAuthenticated);
    isAuthenticatedRef.current = authed;
    if (!authed) {
      stopPolling();
      setReconcileLoading(false);
      setPaymentDialog(prev => (prev.open ? initialPaymentDialogState : prev));
    }
  }, [context?.isAuthenticated, stopPolling]);

  useEffect(() => () => {
    stopPolling();
  }, [stopPolling]);

  const closePaymentDialog = useCallback(() => {
    stopPolling();
    setReconcileLoading(false);
    setPaymentDialog(initialPaymentDialogState);
  }, [stopPolling]);

  if (!context) return null;

  const handleManualReconcile = async () => {
    if (!paymentDialog.sessionId) return;
    setReconcileLoading(true);

    try {
      const result = await context.reconcileCheckout(paymentDialog.sessionId);
      if (!result.success || !result.data) {
        message.error(result.error || t('paid_credits.reconcile_failed'));
        return;
      }

      const statusData = result.data;
      setPaymentDialog(prev => ({
        ...prev,
        orderId: statusData.orderId,
        status: statusData.status,
        providerStatus: statusData.providerStatus,
        amountUsd: statusData.amountUsd,
        creditsAdded: statusData.creditsAdded,
        createdAt: statusData.createdAt,
        lastError: undefined,
      }));

      if (statusData.isFinal) {
        await applyFinalCheckoutStatus(statusData);
        return;
      }

      if (!pollingActiveRef.current) {
        startCheckoutPolling(paymentDialog.sessionId);
      }
      message.info(t('paid_credits.still_pending'));
    } catch (error) {
      console.error('Failed to reconcile checkout:', error);
      message.error(t('paid_credits.reconcile_failed'));
    } finally {
      setReconcileLoading(false);
    }
  };

  const handleTopupClick = async () => {
    setTopupLoading(true);
    try {
      const result = await context.createCheckout(selectedTopupAmount);
      if (!result.success || !result.data) {
        message.error(result.error || t('paid_credits.checkout_failed'));
        return;
      }

      const parsedUrl = new URL(result.data.checkoutUrl);
      if (parsedUrl.protocol !== 'https:') {
        message.error(t('paid_credits.checkout_invalid_url'));
        return;
      }

      window.api.shell.openExternal(parsedUrl.toString());
      setPaymentDialog({
        open: true,
        phase: 'polling',
        sessionId: result.data.sessionId,
        amountUsd: result.data.amountUsd,
        creditsAdded: result.data.creditsToAdd,
      });
      startCheckoutPolling(result.data.sessionId);
      message.success(t('paid_credits.checkout_opened'));
    } catch (error) {
      console.error('Failed to create checkout:', error);
      message.error(t('paid_credits.checkout_failed'));
    } finally {
      setTopupLoading(false);
    }
  };

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

  const getOrderStatusLabel = (status?: string) => {
    if (!status) return '-';
    return t(`paid_credits.order_status_values.${status}`, { defaultValue: status });
  };

  const getProviderStatusLabel = (status?: string) => {
    if (!status) return '-';
    return t(`paid_credits.provider_status_values.${status}`, { defaultValue: status });
  };

  const paymentStatusColorMap: Record<string, string> = {
    pending: 'gold',
    completed: 'green',
    failed: 'red',
    refunded: 'purple',
  };

  const renderDateTime = (text: string) => {
    if (!text) return '-';
    const date = new Date(text);
    return isNaN(date.getTime()) ? text : date.toLocaleString();
  };

  const creditColumns = [
    {
      title: t('history.columns.time'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: renderDateTime,
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

  const paymentColumns = [
    {
      title: t('history.payment_columns.time'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: renderDateTime,
    },
    {
      title: t('history.payment_columns.amount_usd'),
      dataIndex: 'amountUsd',
      key: 'amountUsd',
      align: 'right' as const,
      render: (amountUsd: number) => `$${amountUsd.toFixed(2)}`,
      width: 140,
    },
    {
      title: t('history.payment_columns.credits_added'),
      dataIndex: 'creditsAdded',
      key: 'creditsAdded',
      align: 'right' as const,
      render: (creditsAdded: number) => creditsAdded.toLocaleString(),
      width: 160,
    },
    {
      title: t('history.payment_columns.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={paymentStatusColorMap[status] || 'default'}>
          {getOrderStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: t('history.payment_columns.provider_status'),
      dataIndex: 'providerStatus',
      key: 'providerStatus',
      width: 160,
      render: (providerStatus: string) => (
        <Tag>{getProviderStatusLabel(providerStatus)}</Tag>
      ),
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <Statistic
                title={t('paid_credits.title')}
                value={credits.paid}
                prefix={<CrownOutlined style={{ color: '#722ed1' }} />}
                valueStyle={{ color: '#722ed1' }}
              />
              <Button
                type="primary"
                size="middle"
                style={{ backgroundColor: '#722ed1', marginTop: 4 }}
                onClick={handleTopupClick}
                loading={topupLoading}
              >
                {t('paid_credits.recharge')} ${selectedTopupAmount}
              </Button>
            </div>
            <Row gutter={[8, 8]} style={{ marginTop: 6 }}>
              {topupOptions.map((option) => {
                const selected = selectedTopupAmount === option.amount;
                return (
                  <Col span={8} key={option.amount}>
                    <Button
                      block
                      onClick={() => setSelectedTopupAmount(option.amount)}
                      style={{
                        height: 68,
                        borderRadius: 10,
                        borderColor: selected ? '#722ed1' : '#d9d9d9',
                        background: selected ? '#f4e8ff' : '#ffffff',
                        boxShadow: selected ? '0 2px 8px rgba(114, 46, 209, 0.16)' : 'none',
                        padding: '8px 10px',
                      }}
                    >
                      <div style={{ textAlign: 'left', width: '100%', lineHeight: 1.15 }}>
                        <Text strong style={{ fontSize: 18, color: selected ? '#531dab' : 'rgba(0,0,0,0.88)' }}>
                          ${option.amount}
                        </Text>
                        <div style={{ marginTop: 2 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {option.credits.toLocaleString()} {t('history.columns.credits')}
                          </Text>
                        </div>
                      </div>
                    </Button>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </Col>
      </Row>

      <Divider />

      <Title level={4} style={{ marginTop: '24px', marginBottom: '16px' }}>{t('history.title')}</Title>
      <Tabs
        activeKey={activeHistoryTab}
        onChange={(key) => setActiveHistoryTab(key as 'credits' | 'payments')}
        items={[
          {
            key: 'credits',
            label: t('history.tabs.credits'),
            children: (
              <Table
                dataSource={creditHistory}
                columns={creditColumns}
                rowKey="id"
                loading={loadingCreditHistory}
                pagination={{
                  current: creditCurrentPage,
                  pageSize: historyPageSize,
                  total: creditTotal,
                  onChange: (page) => { void fetchCreditHistory(page); },
                }}
                size="small"
              />
            ),
          },
          {
            key: 'payments',
            label: t('history.tabs.payments'),
            children: (
              <Table
                dataSource={paymentHistory}
                columns={paymentColumns}
                rowKey="id"
                loading={loadingPaymentHistory}
                pagination={{
                  current: paymentCurrentPage,
                  pageSize: historyPageSize,
                  total: paymentTotal,
                  onChange: (page) => { void fetchPaymentHistory(page); },
                }}
                size="small"
              />
            ),
          },
        ]}
      />

      <Modal
        open={paymentDialog.open}
        title={paymentDialog.phase === 'polling'
          ? t('paid_credits.payment_processing')
          : t('paid_credits.payment_result')}
        onCancel={closePaymentDialog}
        maskClosable={false}
        closable={paymentDialog.phase !== 'polling'}
        footer={paymentDialog.phase === 'polling'
          ? [
            <Button key="cancel" onClick={closePaymentDialog}>
              {t('paid_credits.cancel_waiting')}
            </Button>,
            <Button key="confirm" type="primary" loading={reconcileLoading} onClick={handleManualReconcile}>
              {t('paid_credits.confirm_paid')}
            </Button>,
          ]
          : [
            <Button key="close" type="primary" onClick={closePaymentDialog}>
              {t('paid_credits.close_dialog')}
            </Button>,
          ]
        }
      >
        {paymentDialog.phase === 'polling' ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Spin size="small" />
              <Text>{t('paid_credits.waiting_for_confirmation')}</Text>
            </div>
            {paymentDialog.lastError ? (
              <Alert showIcon type="warning" message={paymentDialog.lastError} />
            ) : null}
            <div style={{ display: 'grid', gap: 4 }}>
              <Text type="secondary">
                {t('paid_credits.session_id_label')}: {paymentDialog.sessionId || '-'}
              </Text>
              <Text type="secondary">
                {t('paid_credits.order_status_label')}: {getOrderStatusLabel(paymentDialog.status)}
              </Text>
              <Text type="secondary">
                {t('paid_credits.provider_status_label')}: {getProviderStatusLabel(paymentDialog.providerStatus)}
              </Text>
            </div>
          </Space>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              showIcon
              type={paymentDialog.phase === 'success' ? 'success' : 'error'}
              message={paymentDialog.phase === 'success'
                ? t('paid_credits.result_success')
                : t('paid_credits.result_failed')}
            />
            <div style={{ display: 'grid', gap: 4 }}>
              <Text type="secondary">
                {t('paid_credits.session_id_label')}: {paymentDialog.sessionId || '-'}
              </Text>
              <Text type="secondary">
                {t('paid_credits.order_id_label')}: {paymentDialog.orderId || '-'}
              </Text>
              <Text type="secondary">
                {t('paid_credits.order_status_label')}: {getOrderStatusLabel(paymentDialog.status)}
              </Text>
              <Text type="secondary">
                {t('paid_credits.provider_status_label')}: {getProviderStatusLabel(paymentDialog.providerStatus)}
              </Text>
              <Text type="secondary">
                {t('paid_credits.amount_label')}: ${paymentDialog.amountUsd ?? selectedTopupAmount}
              </Text>
              <Text type="secondary">
                {t('paid_credits.credits_added_label')}: {paymentDialog.creditsAdded ?? '-'}
              </Text>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default AccountCenter;
