import { Flex, Typography, Input, Button, Switch, Space, Divider } from "antd";
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
          <Button>检查</Button>
        </Space.Compact>
      </div>
      <Divider variant="dashed" dashed plain={true}>
        模型配置
      </Divider>
      
    </Flex>
  );
};

export default Provider;
