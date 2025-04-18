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
import React, { useEffect, useState } from "react";

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

  useEffect(() => {
    // 如果有providerId，则获取该服务商的详细信息
    if (providerId) {
      const fetchProviderDetails = async () => {
        try {
          const backendPort = window.electron?.backendPort || 3000;
          const response = await fetch(
            `http://localhost:${backendPort}/api/providers/${providerId}`
          );

          if (!response.ok) {
            throw new Error("获取服务商详情失败");
          }

          const data = await response.json();
          setProviderData(data);
          
          // 设置初始值
          setApiKey(data.api_key || "");
          setBaseUrl(data.base_url || "");
          
          // 根据 provider 类型设置默认后缀
          if (!data.suffix) {
            switch (data.type) {
              case 'openai':
                setSuffix("/chat/completions");
                break;
              case 'gemini':
                setSuffix("/models");
                break;
              case 'anthropic':
                setSuffix("/messages");
                break;
              case 'azure-openai':
                setSuffix("/openai/deployments/");
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
      fetchModels();
    }
  }, [providerId]);

  // 获取服务商下的模型列表
  const fetchModels = async () => {
    if (!providerId) return;
    
    try {
      const backendPort = window.electron?.backendPort || 3000;
      const response = await fetch(
        `http://localhost:${backendPort}/api/models/${providerId}`
      );

      if (!response.ok) {
        throw new Error("获取模型列表失败");
      }

      const data = await response.json();
      setModels(data);
    } catch (error) {
      console.error("获取模型列表出错:", error);
      message.error("获取模型列表失败: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 删除模型
  const deleteModel = async (modelId: string) => {
    if (!providerId) return;

    try {
      const backendPort = window.electron?.backendPort || 3000;
      const response = await fetch(
        `http://localhost:${backendPort}/api/models/${encodeURIComponent(modelId)}/${providerId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("删除模型失败");
      }

      message.success("模型已成功删除");
      // 刷新模型列表
      fetchModels();
    } catch (error) {
      console.error("删除模型出错:", error);
      message.error("删除模型失败: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 添加模型
  const addModel = async () => {
    if (!providerId || !newModelName || !newModelId) {
      message.warning("请填写完整的模型信息");
      return;
    }

    try {
      const backendPort = window.electron?.backendPort || 3000;
      const response = await fetch(
        `http://localhost:${backendPort}/api/models`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: newModelId,
            name: newModelName,
            provider: providerId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("添加模型失败");
      }

      // 添加成功后清空输入框
      setNewModelName("");
      setNewModelId("");
      message.success("模型添加成功");
      // 刷新模型列表
      fetchModels();
    } catch (error) {
      console.error("添加模型出错:", error);
      message.error("添加模型失败: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 更新服务商信息的函数
  const updateProvider = async (updateData: { api_key?: string; base_url?: string; suffix?: string }) => {
    if (!providerId) return;

    try {
      const backendPort = window.electron?.backendPort || 3000;
      const response = await fetch(
        `http://localhost:${backendPort}/api/providers/${providerId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        throw new Error("更新服务商信息失败");
      }

      const updatedProvider = await response.json();
      setProviderData(updatedProvider);
      message.success("更新成功");
    } catch (error) {
      console.error("更新服务商信息出错:", error);
      message.error("更新失败: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 测试模型连接
  const testModelConnection = async (modelId: string) => {
    if (!providerId) return;
    
    setTestingModelId(modelId);
    
    try {
      const backendPort = window.electron?.backendPort || 3000;
      const response = await fetch(
        `http://localhost:${backendPort}/api/try`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providerId: providerId,
            modelId: modelId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("连接测试失败");
      }

      // 测试成功
      message.success("模型连接测试成功");
    } catch (error) {
      console.error("测试模型连接出错:", error);
      message.error("连接测试失败: " + (error instanceof Error ? error.message : String(error)));
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
            协议类型: {providerData?.type}
          </Typography.Text>
        </Space>
        <Switch
          checkedChildren="启用"
          unCheckedChildren="停用"
          checked={providerData?.status === 0}
          onChange={async (checked) => {
            if (!providerId) return;

            try {
              const backendPort = window.electron?.backendPort || 3000;
              const response = await fetch(
                `http://localhost:${backendPort}/api/providers/${providerId}/status`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ status: checked ? 0 : -1 }),
                }
              );

              if (!response.ok) {
                throw new Error("更新服务商状态失败");
              }

              const updatedProvider = await response.json();
              setProviderData(updatedProvider);
            } catch (error) {
              console.error("更新服务商状态出错:", error);
            }
          }}
        />
      </div>
      <div>
        <Typography.Text>API 密钥：</Typography.Text>
        <Input.Password
          placeholder="请输入API密钥"
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
        <Typography.Text>API 地址：</Typography.Text><Typography.Text type="secondary">{baseUrl}{suffix}</Typography.Text>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder="请输入API地址"
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
                    case 'openai':
                      return [
                        { label: "/chat/completions", value: "/chat/completions" },
                        { label: "/v1/chat/completions", value: "/v1/chat/completions" },
                      ];
                    case 'gemini':
                      return [
                        { label: "/models", value: "/models" },
                        { label: "/v1/models", value: "/v1/models" },
                      ];
                    case 'anthropic':
                      return [
                        { label: "/messages", value: "/messages" },
                        { label: "/v1/messages", value: "/v1/messages" },
                      ];
                    case 'azure-openai':
                      return [
                        { label: "/openai/deployments/", value: "/openai/deployments/" },
                        { label: "/v1/openai/deployments/", value: "/v1/openai/deployments/" },
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
        模型配置
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
                title="检查"
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
                title="删除"
                onClick={() => {
                  modal.confirm({
                    title: "确认删除",
                    content: `确定要删除模型"${item.name}"吗？`,
                    okText: "删除",
                    okType: "danger",
                    cancelText: "取消",
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
          <Typography.Text>模型名称：</Typography.Text>
          <Input 
            placeholder="GPT 4o" 
            style={{ width: "290px" }} 
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
          />
          <Typography.Text>模型ID：</Typography.Text>
          <Input 
            placeholder="gpt-4o" 
            style={{ width: "290px" }} 
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
          />
        </Space>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={addModel}
        >
          添加模型
        </Button>
      </div>
      <Typography.Text type="secondary">
        注意：请添加支持视觉识别的模型，并确保模型ID正确，否则模型将无法正常使用！
      </Typography.Text>
      <Button
        title="删除服务商"
        icon={<DeleteOutlined />}
        danger
        onClick={() => {
          if (!providerId) return;

          modal.confirm({
            title: "确认删除",
            content: "确定要删除此服务商吗？删除后无法恢复。",
            okText: "删除",
            okType: "danger",
            cancelText: "取消",
            onOk: async () => {
              try {
                const backendPort = window.electron?.backendPort || 3000;
                const response = await fetch(
                  `http://localhost:${backendPort}/api/providers/${providerId}`,
                  {
                    method: "DELETE",
                  }
                );

                if (!response.ok) {
                  throw new Error("删除服务商失败");
                }

                // 删除成功后，提示用户
                message.success("服务商已成功删除");

                // 调用回调函数通知父组件刷新列表并选中第一个服务商
                if (onProviderDeleted) {
                  onProviderDeleted();
                }
              } catch (error) {
                console.error("删除服务商出错:", error);
                message.error(
                  "删除服务商失败: " +
                    (error instanceof Error ? error.message : String(error))
                );
              }
            },
          });
        }}
      >
        删除服务商
      </Button>
    </Flex>
  );
};

export default Provider;
