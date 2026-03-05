import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
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
  Select,
  Space,
  Spin,
  Splitter,
  Tooltip,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarkdownPreview from "../components/MarkdownPreview";
import { CloudContext } from "../contexts/CloudContextDefinition";
import type {
  CloudModelTier,
  CloudTaskResponse,
  CloudTaskPageResponse,
  CloudSSEEvent,
} from "../../shared/types/cloud-api";

const { Text } = Typography;

const dedupeAndSortPages = (pageItems: CloudTaskPageResponse[]): CloudTaskPageResponse[] =>
  Array.from(new Map(pageItems.map((page) => [page.page, page])).values())
    .sort((a, b) => a.page - b.page);

const CLOUD_MODEL_TIERS: CloudModelTier[] = ['lite', 'pro', 'ultra'];

const CloudPreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { t } = useTranslation('cloud-preview');
  const { t: tCommon } = useTranslation('common');
  const cloudContext = useContext(CloudContext);

  const [task, setTask] = useState<CloudTaskResponse | null>(null);
  const [pages, setPages] = useState<CloudTaskPageResponse[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const taskPagesPageSizeRef = useRef(100);
  const attemptedFallbackPagesRef = useRef<Set<number>>(new Set());
  const inFlightFallbackPagesRef = useRef<Set<number>>(new Set());

  const currentPageData = pages.find(p => p.page === currentPage);

  // Fetch task metadata
  const fetchTask = useCallback(async () => {
    if (!id || !cloudContext) return;

    try {
      const result = await cloudContext.getTaskById(id);
      if (result.success && result.data) {
        setTask(result.data);
      } else {
        message.error(result.error || t('fetch_task_failed'));
        navigate('/list');
      }
    } catch {
      message.error(t('fetch_task_failed'));
      navigate('/list');
    }
  }, [id, cloudContext, message, navigate, t]);

  // Fetch pages
  const fetchPages = useCallback(async () => {
    if (!id || !cloudContext) return;

    attemptedFallbackPagesRef.current.clear();
    inFlightFallbackPagesRef.current.clear();
    taskPagesPageSizeRef.current = 100;
    setLoading(true);
    try {
      const requestedPageSize = 100;
      const result = await cloudContext.getTaskPages(id, 1, requestedPageSize);
      if (result.success) {
        const effectivePageSize = Math.max(1, result.pagination?.page_size || requestedPageSize);
        taskPagesPageSizeRef.current = effectivePageSize;
        const allPages = [...(result.data || [])];
        const totalApiPages = Math.max(1, result.pagination?.total_pages || 1);

        for (let apiPage = 2; apiPage <= totalApiPages; apiPage++) {
          try {
            const nextPageResult = await cloudContext.getTaskPages(id, apiPage, effectivePageSize);
            if (nextPageResult.success && nextPageResult.data?.length) {
              allPages.push(...nextPageResult.data);
            }
          } catch {
            console.error(`Failed to fetch page chunk ${apiPage}`);
          }
        }

        setPages(dedupeAndSortPages(allPages));
      }
    } catch {
      console.error('Failed to fetch pages');
    } finally {
      setLoading(false);
    }
  }, [id, cloudContext]);

  // Fallback: ensure current page data is available even if backend enforces small page-size caps.
  const ensureCurrentPageLoaded = useCallback(async () => {
    if (!id || !cloudContext || loading) return;
    if (pages.some(page => page.page === currentPage)) return;
    if (attemptedFallbackPagesRef.current.has(currentPage) || inFlightFallbackPagesRef.current.has(currentPage)) return;

    const targetPage = currentPage;
    let shouldMarkAttempted = true;
    let effectivePageSize = Math.max(1, taskPagesPageSizeRef.current || 1);
    let fallbackApiPage = Math.max(1, Math.floor((targetPage - 1) / effectivePageSize) + 1);
    inFlightFallbackPagesRef.current.add(targetPage);
    try {
      let result = await cloudContext.getTaskPages(id, fallbackApiPage, effectivePageSize);
      const responsePageSize = result.pagination?.page_size ? Math.max(1, result.pagination.page_size) : undefined;

      if (responsePageSize) {
        taskPagesPageSizeRef.current = responsePageSize;
        if (responsePageSize !== effectivePageSize) {
          effectivePageSize = responsePageSize;
          const correctedApiPage = Math.max(1, Math.floor((targetPage - 1) / effectivePageSize) + 1);
          if (correctedApiPage !== fallbackApiPage) {
            fallbackApiPage = correctedApiPage;
            result = await cloudContext.getTaskPages(id, fallbackApiPage, effectivePageSize);
          }
        }
      }

      const pageItems = (result.data || []).filter(page => page.page === targetPage);
      if (result.success && pageItems?.length) {
        setPages(prev => dedupeAndSortPages([...prev, ...pageItems]));
      }

      if (!result.success && !responsePageSize) {
        shouldMarkAttempted = false;
      }
    } catch {
      console.error('Failed to fetch current page data');
    } finally {
      inFlightFallbackPagesRef.current.delete(targetPage);
      if (shouldMarkAttempted) {
        attemptedFallbackPagesRef.current.add(targetPage);
      }
    }
  }, [id, cloudContext, currentPage, loading, pages]);

  useEffect(() => {
    taskPagesPageSizeRef.current = 100;
    attemptedFallbackPagesRef.current.clear();
    inFlightFallbackPagesRef.current.clear();
  }, [id]);

  // Load image for current page
  const loadPageImage = useCallback(async () => {
    if (!id || !currentPageData) {
      setImageUrl(null);
      return;
    }

    const rawUrl = currentPageData.image_url;
    if (!rawUrl) {
      setImageUrl(null);
      return;
    }

    setImageError(false);

    // Presigned URL (full https URL) — use directly
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      setImageUrl(rawUrl);
      return;
    }

    // Relative API path — proxy through main process
    setImageLoading(true);
    try {
      const result = await window.api.cloud.getPageImage({ taskId: id, pageNumber: currentPageData.page });
      if (result.success && result.data) {
        setImageUrl(result.data.dataUrl);
      } else {
        setImageUrl(null);
        setImageError(true);
      }
    } catch {
      setImageUrl(null);
      setImageError(true);
    } finally {
      setImageLoading(false);
    }
  }, [id, currentPageData]);

  useEffect(() => {
    fetchTask();
    fetchPages();
  }, [fetchTask, fetchPages]);

  // Load image when current page changes
  useEffect(() => {
    loadPageImage();
  }, [loadPageImage]);

  useEffect(() => {
    ensureCurrentPageLoaded();
  }, [ensureCurrentPageLoaded]);

  // SSE event listener for real-time updates
  useEffect(() => {
    if (!id || !window.api?.events?.onCloudTaskEvent) return;

    const handleEvent = (event: CloudSSEEvent) => {
      const taskId = (event.data as any).task_id;
      if (taskId !== id) return;

      switch (event.type) {
        case 'page_completed': {
          const { page, markdown } = event.data as any;
          setPages(prev => {
            const idx = prev.findIndex(p => p.page === page);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], status: 2, markdown };
              return updated;
            }
            return [...prev, { page, status: 2, status_name: 'COMPLETED', markdown, width_mm: 210, height_mm: 297 }];
          });
          setTask(prev => prev ? {
            ...prev,
            pages_completed: (prev.pages_completed || 0) + 1,
          } : null);
          break;
        }
        case 'page_started': {
          const { page } = event.data as any;
          setPages(prev => {
            const idx = prev.findIndex(p => p.page === page);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], status: 1 };
              return updated;
            }
            return [...prev, { page, status: 1, status_name: 'PROCESSING', markdown: '', width_mm: 210, height_mm: 297 }];
          });
          break;
        }
        case 'page_failed': {
          const { page } = event.data as any;
          setPages(prev => {
            const idx = prev.findIndex(p => p.page === page);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], status: 3 };
              return updated;
            }
            return prev;
          });
          setTask(prev => prev ? {
            ...prev,
            pages_failed: (prev.pages_failed || 0) + 1,
          } : null);
          break;
        }
        case 'completed': {
          const data = event.data as any;
          setTask(prev => prev ? {
            ...prev,
            status: data.status || 6,
            pages_completed: data.pages_completed,
            pages_failed: data.pages_failed,
          } : null);
          break;
        }
        case 'error': {
          setTask(prev => prev ? { ...prev, status: 0 } : null);
          break;
        }
        case 'cancelled': {
          setTask(prev => prev ? { ...prev, status: 7 } : null);
          break;
        }
        case 'pdf_ready': {
          const { page_count } = event.data as any;
          setTask(prev => prev ? { ...prev, status: 3, page_count } : null);
          break;
        }
      }
    };

    const cleanup = window.api.events.onCloudTaskEvent(handleEvent);
    return () => cleanup();
  }, [id]);

  // Download result as markdown
  const handleDownloadMarkdown = async () => {
    if (!id || !cloudContext) return;

    setDownloading(true);
    try {
      const result = await cloudContext.getTaskResult(id);
      if (result.success && result.data) {
        // Create a blob and trigger download
        const blob = new Blob([result.data.markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (task?.file_name?.replace(/\.[^.]+$/, '') || 'result') + '.md';
        a.click();
        URL.revokeObjectURL(url);
        message.success(t('download_success'));
      } else {
        message.error(result.error || t('download_failed'));
      }
    } catch {
      message.error(t('download_failed'));
    } finally {
      setDownloading(false);
    }
  };

  // Download generated PDF
  const handleDownloadPdf = async () => {
    if (!id || !cloudContext) return;

    setDownloading(true);
    try {
      const result = await cloudContext.downloadResult(id);
      if (result.success) {
        message.success(t('download_success'));
      } else {
        message.error(result.error || t('download_failed'));
      }
    } catch {
      message.error(t('download_failed'));
    } finally {
      setDownloading(false);
    }
  };

  // Cancel task
  const handleCancel = async () => {
    if (!id || !cloudContext) return;

    modal.confirm({
      title: t('confirm_cancel'),
      content: t('confirm_cancel_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        const result = await cloudContext.cancelTask(id);
        if (result.success) {
          message.success(t('cancel_success'));
          navigate('/list');
        } else {
          message.error(result.error || t('cancel_failed'));
        }
      },
    });
  };

  // Retry entire task
  const handleRetryTask = async () => {
    if (!id || !cloudContext) return;

    const options = CLOUD_MODEL_TIERS.map((tier) => ({
      value: tier,
      label: t(`retry_model.${tier}`),
    }));
    const taskTier = (task?.model_tier || 'lite') as CloudModelTier;
    let selectedModel: CloudModelTier = CLOUD_MODEL_TIERS.includes(taskTier) ? taskTier : 'lite';

    modal.confirm({
      title: t('confirm_retry_with_model'),
      content: (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8 }}>{t('select_retry_model')}</div>
          <Select
            style={{ width: '100%' }}
            options={options}
            defaultValue={selectedModel}
            onChange={(value) => {
              selectedModel = value;
            }}
          />
        </div>
      ),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        const result = await cloudContext.retryTask(id, selectedModel);
        if (result.success && result.data) {
          message.success(t('retry_success'));
          navigate(`/list/cloud-preview/${result.data.task_id}`);
        } else {
          message.error(result.error || t('retry_failed'));
        }
      },
    });
  };

  // Retry current page
  const handleRetryPage = async () => {
    if (!id || !cloudContext || !currentPageData) return;

    const options = CLOUD_MODEL_TIERS.map((tier) => ({
      value: tier,
      label: t(`retry_model.${tier}`),
    }));
    const taskTier = (task?.model_tier || 'lite') as CloudModelTier;
    let selectedModel: CloudModelTier = CLOUD_MODEL_TIERS.includes(taskTier) ? taskTier : 'lite';

    modal.confirm({
      title: t('confirm_page_retry_with_model'),
      content: (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8 }}>{t('select_retry_model')}</div>
          <Select
            style={{ width: '100%' }}
            options={options}
            defaultValue={selectedModel}
            onChange={(value) => {
              selectedModel = value;
            }}
          />
        </div>
      ),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        setRetrying(true);
        try {
          const result = await cloudContext.retryPage(id, currentPage, selectedModel);
          if (result.success) {
            message.success(t('page_retry_success'));
            // Update page status locally
            setPages(prev => {
              const idx = prev.findIndex(p => p.page === currentPage);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], status: 1 };
                return updated;
              }
              return prev;
            });
          } else {
            message.error(result.error || t('page_retry_failed'));
          }
        } catch {
          message.error(t('page_retry_failed'));
        } finally {
          setRetrying(false);
        }
      },
    });
  };

  // Retry all failed pages
  const handleRetryFailed = async () => {
    if (!id || !cloudContext) return;

    modal.confirm({
      title: t('confirm_retry_failed'),
      content: t('confirm_retry_failed_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      onOk: async () => {
        setRetryingFailed(true);
        try {
          const failedPages = pages.filter(p => p.status === 3);
          let retriedCount = 0;
          for (const page of failedPages) {
            const result = await cloudContext.retryPage(id, page.page);
            if (result.success) {
              retriedCount++;
              setPages(prev => {
                const idx = prev.findIndex(p => p.page === page.page);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], status: 1 };
                  return updated;
                }
                return prev;
              });
            }
          }
          if (retriedCount > 0) {
            message.success(t('retry_failed_success', { count: retriedCount }));
          } else {
            message.error(t('retry_failed'));
          }
        } catch {
          message.error(t('retry_failed'));
        } finally {
          setRetryingFailed(false);
        }
      },
    });
  };

  // Copy current page markdown
  const handleCopyMarkdown = async () => {
    const markdown = currentPageData?.markdown || '';
    if (!markdown) return;

    try {
      await navigator.clipboard.writeText(markdown);
      message.success(t('copy_markdown_success'));
    } catch {
      message.error(t('copy_markdown_failed'));
    }
  };

  // Copy current page image to system clipboard
  const handleCopyImage = async () => {
    if (!imageUrl) return;

    try {
      let sourceForClipboard = imageUrl;
      const isRemoteImage = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');

      if (isRemoteImage) {
        if (!id || !currentPageData) {
          message.error(t('copy_image_failed'));
          return;
        }

        const proxyImageResult = await window.api.cloud.getPageImage({ taskId: id, pageNumber: currentPageData.page });
        if (!proxyImageResult.success || !proxyImageResult.data?.dataUrl) {
          message.error(proxyImageResult.error || t('copy_image_failed'));
          return;
        }
        sourceForClipboard = proxyImageResult.data.dataUrl;
      }

      const result = await window.api.file.copyImageToClipboard(sourceForClipboard);
      if (result.success) {
        message.success(t('copy_image_success'));
      } else {
        message.error(result.error || t('copy_image_failed'));
      }
    } catch {
      message.error(t('copy_image_failed'));
    }
  };

  // Delete task
  const handleDelete = async () => {
    if (!id || !cloudContext) return;

    modal.confirm({
      title: t('confirm_delete'),
      content: t('confirm_delete_content'),
      okText: tCommon('common.confirm'),
      cancelText: tCommon('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const result = await cloudContext.deleteTask(id);
        if (result.success) {
          message.success(t('delete_success'));
          navigate('/list');
        } else {
          message.error(result.error || t('delete_failed'));
        }
      },
    });
  };

  // Page status info
  const getPageStatusInfo = () => {
    if (!currentPageData) return null;
    const status = currentPageData.status;
    const iconStyle = { fontSize: 14 };

    switch (status) {
      case 0: // PENDING
        return {
          icon: <ClockCircleFilled style={{ ...iconStyle, color: '#faad14' }} />,
          text: t('page_status.pending'),
          color: '#faad14',
        };
      case 1: // PROCESSING
        return {
          icon: <LoadingOutlined style={{ ...iconStyle, color: '#1890ff' }} spin />,
          text: t('page_status.processing'),
          color: '#1890ff',
        };
      case 2: // COMPLETED
        return {
          icon: <CheckCircleFilled style={{ ...iconStyle, color: '#52c41a' }} />,
          text: t('page_status.completed'),
          color: '#52c41a',
        };
      case 3: // FAILED
        return {
          icon: <CloseCircleFilled style={{ ...iconStyle, color: '#ff4d4f' }} />,
          text: t('page_status.failed'),
          color: '#ff4d4f',
        };
      default:
        return null;
    }
  };

  const pageStatusInfo = getPageStatusInfo();
  const totalPages = task?.page_count || 0;
  const progress = task ? (task.status === 6 ? 100 : totalPages > 0 ? Math.round(((task.pages_completed || 0) / totalPages) * 100) : 0) : 0;
  const canDownload = task?.status === 6 && !downloading;
  const downloadMenuItems: MenuProps['items'] = [
    {
      key: 'download_md',
      icon: <FileMarkdownOutlined />,
      label: t('download_md'),
      onClick: handleDownloadMarkdown,
    },
    {
      key: 'download_pdf',
      icon: <FilePdfOutlined />,
      label: t('download_pdf'),
      onClick: handleDownloadPdf,
    },
  ];

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
            {t('back')}
          </Button>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", width: "200px" }}>
            <Tooltip title={task?.file_name || ''}>
              <Text strong style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                [{tCommon('common.pages', { count: totalPages })}]{task?.file_name || ''}
              </Text>
            </Tooltip>

            {task && (
              <Progress
                percent={progress}
                size="small"
                status={task.status === 6 ? 'success' : task.status === 0 ? 'exception' : 'active'}
                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                showInfo={false}
                style={{ width: "100%" }}
              />
            )}
          </div>

          <Space>
            <Dropdown
              menu={{ items: downloadMenuItems }}
              trigger={['click']}
              disabled={!canDownload}
            >
              <Button
                color="primary"
                icon={downloading ? <LoadingOutlined /> : <DownloadOutlined />}
                variant="filled"
                disabled={!canDownload}
              >
                {t('download')}
                <DownOutlined />
              </Button>
            </Dropdown>

            {/* Action dropdown */}
            {(() => {
              const status = task?.status;
              const failedCount = task?.pages_failed || 0;

              const menuItems: MenuProps['items'] = [];

              // Retry failed pages: status === 8 && pages_failed > 0
              if (status === 8 && failedCount > 0) {
                menuItems.push({
                  key: 'retry_failed',
                  icon: <ReloadOutlined />,
                  label: t('retry_failed_pages'),
                  onClick: handleRetryFailed,
                  disabled: retryingFailed,
                });
              }

              // Retry all: status === 0 (failed) or status === 6 (completed)
              if (status === 0 || status === 6) {
                menuItems.push({
                  key: 'retry_all',
                  icon: <ReloadOutlined />,
                  label: t('retry_all'),
                  onClick: handleRetryTask,
                });
              }

              // Divider
              if (menuItems.length > 0 && ((status !== undefined && status > 0 && status < 6) || status === 0 || (status !== undefined && status >= 6))) {
                menuItems.push({ type: 'divider' });
              }

              // Cancel: status > 0 && status < 6
              if (status !== undefined && status > 0 && status < 6) {
                menuItems.push({
                  key: 'cancel',
                  icon: <StopOutlined />,
                  label: t('cancel_task'),
                  onClick: handleCancel,
                });
              }

              // Delete: status === 0 || status >= 6 (terminal states)
              if (status === 0 || (status !== undefined && status >= 6)) {
                menuItems.push({
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: t('delete_task'),
                  danger: true,
                  onClick: handleDelete,
                });
              }

              if (menuItems.length === 0) return null;

              // Check for primary action (retry failed or retry all)
              const hasRetryFailed = status === 8 && failedCount > 0;
              const hasRetryAll = status === 0;
              const hasPrimaryAction = hasRetryFailed || hasRetryAll;

              if (hasPrimaryAction) {
                const primaryLabel = hasRetryFailed ? t('retry_failed_pages') : t('retry_all');
                const primaryAction = hasRetryFailed ? handleRetryFailed : handleRetryTask;
                const primaryIcon = hasRetryFailed && retryingFailed ? <LoadingOutlined /> : <ReloadOutlined />;

                // Filter out primary action from dropdown to avoid duplication
                const filteredMenuItems = menuItems.filter(item => {
                  if (!item || item.type === 'divider') return true;
                  if (hasRetryFailed && (item as any).key === 'retry_failed') return false;
                  if (hasRetryAll && (item as any).key === 'retry_all') return false;
                  return true;
                });

                // Remove leading dividers
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
                return (
                  <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                    <Button>
                      {t('more_actions')}
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
          {/* Left Panel: Page list overview */}
          <Splitter.Panel
            defaultSize="35%"
            min="25%"
            max="50%"
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "12px",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Tooltip title={t('copy_image_tooltip')}>
                <Button
                  className="preview-floating-action"
                  aria-label={t('copy_image')}
                  icon={<CopyOutlined />}
                  shape="circle"
                  size="small"
                  onClick={handleCopyImage}
                  disabled={loading || imageLoading || imageError || !imageUrl}
                />
              </Tooltip>
              {loading || imageLoading ? (
                <Spin size="large" />
              ) : !currentPageData ? (
                <div style={{ textAlign: 'center', color: '#999' }}>
                  <Text type="secondary">{t('no_page_data')}</Text>
                </div>
              ) : imageError || !imageUrl ? (
                <div style={{ textAlign: 'center', color: '#999' }}>
                  <Text type="secondary">{t('page_label', { page: currentPage, total: totalPages })}</Text>
                </div>
              ) : (
                <img
                  src={imageUrl}
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

            {/* Bottom status bar */}
            {!loading && currentPageData && (
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
                {pageStatusInfo ? (
                  <Space size={6}>
                    {pageStatusInfo.icon}
                    <Text style={{ fontSize: 13, color: pageStatusInfo.color }}>
                      {pageStatusInfo.text}
                    </Text>
                  </Space>
                ) : (
                  <span />
                )}
                <Tooltip title={t('regenerate_tooltip')}>
                  <Button
                    type="text"
                    size="small"
                    icon={retrying ? <LoadingOutlined /> : <ReloadOutlined />}
                    onClick={handleRetryPage}
                    disabled={retrying || !currentPageData || currentPageData.status === 1}
                    style={{ color: '#666' }}
                  >
                    {t('regenerate')}
                  </Button>
                </Tooltip>
              </div>
            )}
          </Splitter.Panel>

          {/* Markdown Panel */}
          <Splitter.Panel style={{ overflow: "hidden", minWidth: 0 }}>
            <div style={{ position: "relative", height: "100%" }}>
              <Tooltip title={t('copy_markdown_tooltip')}>
                <Button
                  className="preview-floating-action"
                  aria-label={t('copy_markdown')}
                  icon={<CopyOutlined />}
                  shape="circle"
                  size="small"
                  onClick={handleCopyMarkdown}
                  disabled={!currentPageData?.markdown}
                />
              </Tooltip>
              <MarkdownPreview content={currentPageData?.markdown || ''} />
            </div>
          </Splitter.Panel>
        </Splitter>

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pagination
            current={currentPage}
            total={totalPages}
            pageSize={1}
            onChange={setCurrentPage}
            showSizeChanger={false}
            disabled={loading}
          />
        </div>
      </div>
    </App>
  );
};

export default CloudPreview;
