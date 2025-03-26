import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Flex, Typography, Input, Button, Switch, Space, Divider, Select, List } from "antd";
import React from "react";

const Provider: React.FC = () => {
  return (
    <Flex vertical gap={16} style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Typography.Text strong>MarkPDFdown</Typography.Text>
        <Switch
          checkedChildren="启用"
          unCheckedChildren="停用"
          defaultChecked
        />
      </div>
      <div>
        <Typography.Text>API 密钥：</Typography.Text>
        <Input.Password placeholder="请输入API密钥" />
      </div>
      <div>
        <Typography.Text>API 地址：</Typography.Text>
        <Space.Compact style={{ width: "100%" }}>
          <Input placeholder="请输入API地址" />
          <Select style={{ width: 250 }} defaultValue="/chat/completions" options={[
            { label: "/chat/completions", value: "/chat/completions" },
            { label: "/v1/chat/completions", value: "/v1/chat/completions" },
            { label: "无需后缀", value: "" },
          ]} />
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
          }
        ]}
        renderItem={(item) => (
          <List.Item>
            <Space>
              <Typography.Text>{item.name}</Typography.Text>
              <Typography.Text type="secondary">({item.model})</Typography.Text>
              <Button icon={<ThunderboltOutlined />} shape="circle" size="small" title="检查"></Button>
            </Space>
            <Space>
              <Button icon={<DeleteOutlined />} shape="circle" danger size="small" title="删除"></Button>
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
        <Button type="primary" icon={<PlusOutlined />}>添加模型</Button>
      </div>
      <Typography.Text type="secondary">注意：请添加支持视觉识别的模型，并确保模型ID正确，否则模型将无法使用</Typography.Text>

    </Flex>
  );
};

export default Provider;
