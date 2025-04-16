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

const Provider: React.FC<ProviderProps> = ({
  providerId,
  onProviderDeleted,
}) => {
  const [providerData, setProviderData] = useState<any>(null);
  const { modal, message } = App.useApp();

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
        } catch (error) {
          console.error("获取服务商详情出错:", error);
        }
      };

      fetchProviderDetails();
    }
  }, [providerId]);

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
          defaultValue={providerData?.api_key || ""}
        />
      </div>
      <div>
        <Typography.Text>API 地址：</Typography.Text>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder="请输入API地址"
            defaultValue={providerData?.base_url || ""}
            addonAfter={
              <Select
                style={{ width: 180 }}
                defaultValue={providerData?.suffix || "/chat/completions"}
                options={[
                  { label: "/chat/completions", value: "/chat/completions" },
                  {
                    label: "/v1/chat/completions",
                    value: "/v1/chat/completions",
                  },
                  { label: "无需后缀", value: "" },
                ]}
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
        dataSource={[
          {
            name: "GPT 4o Mini",
            model: "gpt-4o-mini",
          },
          {
            name: "GPT 4o",
            model: "gpt-4o",
          },
        ]}
        renderItem={(item) => (
          <List.Item>
            <Space>
              <Typography.Text>{item.name}</Typography.Text>
              <Typography.Text type="secondary">({item.model})</Typography.Text>
              <Button
                icon={<ThunderboltOutlined />}
                shape="circle"
                size="small"
                title="检查"
              ></Button>
            </Space>
            <Space>
              <Button
                icon={<DeleteOutlined />}
                shape="circle"
                danger
                size="small"
                title="删除"
              ></Button>
            </Space>
          </List.Item>
        )}
      />

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Space>
          <Typography.Text>模型名称：</Typography.Text>
          <Input placeholder="GPT 4o" style={{ width: "290px" }} />
          <Typography.Text>模型ID：</Typography.Text>
          <Input placeholder="gpt-4o" style={{ width: "290px" }} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />}>
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
