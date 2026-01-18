import {
  DeleteOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Flex,
  Typography,
  Input,
  Button,
  Switch,
  Space,
  Divider,
  Select,
  List,
  App,
} from "antd";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

interface ProviderProps {
  providerId?: number;
  onProviderDeleted?: () => void;
}

interface ModelType {
  id: string;
  name: string;
  provider: number;
}

const Provider: React.FC<ProviderProps> = ({
  providerId,
  onProviderDeleted,
}) => {
  const [providerData, setProviderData] = useState<any>(null);
  const { modal, message } = App.useApp();
  const { t } = useTranslation('provider');
  const { t: tCommon } = useTranslation('common');

  // 添加状态变量用于存储输入值
  const [apiKey, setApiKey] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [suffix, setSuffix] = useState<string>("");

  // 添加模型相关状态
  const [models, setModels] = useState<ModelType[]>([]);
  const [newModelName, setNewModelName] = useState<string>("");
  const [newModelId, setNewModelId] = useState<string>("");

  // 添加测试状态
  const [testingModelId, setTestingModelId] = useState<string>("");

  // 使用 ref 存储 fetchModels 函数，避免初始化顺序问题
  const fetchModelsRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    // 如果有providerId，则获取该服务商的详细信息
    if (providerId) {
      const fetchProviderDetails = async () => {
        try {
          const result = await window.api.provider.getById(providerId);

          if (!result.success) {
            throw new Error(result.error || t('messages.fetch_details_failed'));
          }

          const data = result.data;
          setProviderData(data);

          // 设置初始值
          setApiKey(data.api_key || "");
          setBaseUrl(data.base_url || "");

          // 根据 provider 类型设置默认后缀
          if (!data.suffix) {
            switch (data.type) {
              case "openai":
                setSuffix("/chat/completions");
                break;
              case "gemini":
                setSuffix("/models");
                break;
              case "anthropic":
                setSuffix("/messages");
                break;
              case "ollama":
                setSuffix("/chat");
                break;
              default:
                setSuffix("");
            }
          } else {
            setSuffix(data.suffix);
          }
        } catch (error) {
          console.error("获取服务商详情出错:", error);
        }
      };

      fetchProviderDetails();

      // 获取该服务商下的所有模型
      fetchModelsRef.current();
    }
  }, [providerId, t]);

  // 获取服务商下的模型列表
  const fetchModels = useCallback(async () => {
    if (!providerId) return;

    try {
      const result = await window.api.model.getByProvider(providerId);

      if (!result.success) {
        throw new Error(result.error || t('messages.fetch_models_failed'));
      }

      setModels(result.data);
    } catch (error) {
      console.error("获取模型列表出错:", error);
      message.error(
        t('messages.fetch_models_failed') + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }, [providerId, message, t]);

  // 更新 ref
  useEffect(() => {
    fetchModelsRef.current = fetchModels;
  }, [fetchModels]);

  // 删除模型
  const deleteModel = async (modelId: string) => {
    if (!providerId) return;

    try {
      const result = await window.api.model.delete(modelId, providerId);

      if (!result.success) {
        throw new Error(result.error || t('messages.delete_model_failed'));
      }

      message.success(t('messages.delete_model_success'));
      // 刷新模型列表
      fetchModelsRef.current();
    } catch (error) {
      console.error("删除模型出错:", error);
      message.error(
        t('messages.delete_model_failed') + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  // 添加模型
  const addModel = async () => {
    if (!providerId || !newModelName || !newModelId) {
      message.warning(t('messages.add_model_warning'));
      return;
    }

    try {
      const result = await window.api.model.create({
        id: newModelId,
        name: newModelName,
        provider: providerId,
      });

      if (!result.success) {
        throw new Error(result.error || t('messages.add_model_failed'));
      }

      // 添加成功后清空输入框
      setNewModelName("");
      setNewModelId("");
      message.success(t('messages.add_model_success'));
      // 刷新模型列表
      fetchModelsRef.current();
    } catch (error) {
      console.error("添加模型出错:", error);
      message.error(
        t('messages.add_model_failed') + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  // 更新服务商信息的函数
  const updateProvider = async (updateData: {
    api_key?: string;
    base_url?: string;
    suffix?: string;
  }) => {
    if (!providerId) return;

    try {
      const result = await window.api.provider.update(providerId, updateData);

      if (!result.success) {
        throw new Error(result.error || t('messages.update_failed'));
      }

      setProviderData(result.data);
      message.success(t('messages.update_success'));
    } catch (error) {
      console.error("更新服务商信息出错:", error);
      message.error(
        t('messages.update_failed') + ": " + (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  // 测试模型连接
  const testModelConnection = async (modelId: string) => {
    if (!providerId) return;

    setTestingModelId(modelId);

    try {
      const result = await window.api.completion.testConnection(
        providerId,
        modelId,
      );

      if (!result.success) {
        throw new Error(result.error || t('messages.test_failed'));
      }

      // 测试成功
      message.success(t('messages.test_success'));
    } catch (error) {
      console.error("测试模型连接出错:", error);
      message.error(
        t('messages.test_failed') + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setTestingModelId("");
    }
  };

  return (
    <Flex vertical gap={16} style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Space>
          <Typography.Text strong>
            {providerData?.name || "MarkPDFdown"}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t('details.protocol_type')} {providerData?.type}
          </Typography.Text>
        </Space>
        <Switch
          checkedChildren={tCommon('status.enabled')}
          unCheckedChildren={tCommon('status.disabled')}
          checked={providerData?.status === 0}
          onChange={async (checked) => {
            if (!providerId) return;

            try {
              const result = await window.api.provider.updateStatus(
                providerId,
                checked ? 0 : -1,
              );

              if (!result.success) {
                throw new Error(result.error || t('messages.update_status_failed'));
              }

              setProviderData(result.data);
            } catch (error) {
              console.error("更新服务商状态出错:", error);
            }
          }}
        />
      </div>
      <div>
        <Typography.Text>{t('details.api_key_label')}</Typography.Text>
        <Input.Password
          placeholder={t('details.api_key_placeholder')}
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
          }}
          onBlur={() => {
            if (apiKey !== providerData?.api_key) {
              updateProvider({ api_key: apiKey });
            }
          }}
        />
      </div>
      <div>
        <Typography.Text>{t('details.api_url_label')}</Typography.Text>
        <Typography.Text type="secondary">
          {baseUrl}
          {suffix}
        </Typography.Text>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder={t('details.api_url_placeholder')}
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
            }}
            onBlur={() => {
              if (baseUrl !== providerData?.base_url) {
                updateProvider({ base_url: baseUrl, suffix: suffix });
              }
            }}
            addonAfter={
              <Select
                style={{ width: 180 }}
                value={suffix}
                onChange={(value) => {
                  setSuffix(value);
                  updateProvider({ suffix: value });
                }}
                options={(() => {
                  const type = providerData?.type;
                  switch (type) {
                    case "openai":
                      return [
                        {
                          label: "/chat/completions",
                          value: "/chat/completions",
                        },
                        {
                          label: "/v1/chat/completions",
                          value: "/v1/chat/completions",
                        },
                      ];
                    case "gemini":
                      return [
                        { label: "/models", value: "/models" },
                        { label: "/v1beta/models", value: "/v1beta/models" },
                      ];
                    case "anthropic":
                      return [
                        { label: "/messages", value: "/messages" },
                        { label: "/v1/messages", value: "/v1/messages" },
                      ];
                    case "ollama":
                      return [
                        { label: "/chat", value: "/chat" },
                        { label: "/api/chat", value: "/api/chat" },
                      ];
                    default:
                      return [];
                  }
                })()}
              />
            }
          />
        </Space.Compact>
      </div>

      <Divider variant="dashed" dashed plain={true}>
        {t('model_config.title')}
      </Divider>
      <List
        bordered={true}
        size="small"
        dataSource={models}
        renderItem={(item) => (
          <List.Item>
            <Space>
              <Typography.Text>{item.name}</Typography.Text>
              <Typography.Text type="secondary">({item.id})</Typography.Text>
              <Button
                icon={<ThunderboltOutlined />}
                shape="circle"
                size="small"
                title={tCommon('actions.check')}
                onClick={() => testModelConnection(item.id)}
                loading={testingModelId === item.id}
              ></Button>
            </Space>
            <Space>
              <Button
                icon={<DeleteOutlined />}
                shape="circle"
                danger
                size="small"
                title={tCommon('actions.delete')}
                onClick={() => {
                  modal.confirm({
                    title: t('confirmations.delete_model_title'),
                    content: t('confirmations.delete_model_content', { name: item.name }),
                    okText: t('confirmations.ok'),
                    okType: "danger",
                    cancelText: t('confirmations.cancel'),
                    onOk: () => deleteModel(item.id),
                  });
                }}
              ></Button>
            </Space>
          </List.Item>
        )}
      />

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Space>
          <Typography.Text>{t('model_config.name_label')}</Typography.Text>
          <Input
            placeholder={t('model_config.name_placeholder')}
            style={{ width: "290px" }}
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
          />
          <Typography.Text>{t('model_config.id_label')}</Typography.Text>
          <Input
            placeholder={t('model_config.id_placeholder')}
            style={{ width: "290px" }}
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={addModel}>
          {t('model_config.add_button')}
        </Button>
      </div>
      <Typography.Text type="secondary">
        {t('model_config.warning')}
      </Typography.Text>
      <Button
        title={t('actions.delete_provider')}
        icon={<DeleteOutlined />}
        danger
        onClick={() => {
          if (!providerId) return;

          modal.confirm({
            title: t('confirmations.delete_provider_title'),
            content: t('confirmations.delete_provider_content'),
            okText: t('confirmations.ok'),
            okType: "danger",
            cancelText: t('confirmations.cancel'),
            onOk: async () => {
              try {
                const result = await window.api.provider.delete(providerId);

                if (!result.success) {
                  throw new Error(result.error || t('messages.delete_provider_failed'));
                }

                // 删除成功后，提示用户
                message.success(t('messages.delete_provider_success'));

                // 调用回调函数通知父组件刷新列表并选中第一个服务商
                if (onProviderDeleted) {
                  onProviderDeleted();
                }
              } catch (error) {
                console.error("删除服务商出错:", error);
                message.error(
                  t('messages.delete_provider_failed') + ": " +
                    (error instanceof Error ? error.message : String(error)),
                );
              }
            },
          });
        }}
      >
        {t('actions.delete_provider')}
      </Button>
    </Flex>
  );
};

export default Provider;
