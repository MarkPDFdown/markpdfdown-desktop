import React from "react";
import { ConfigProvider, Tabs } from "antd";
import AddProvider from "./AddProvider";
import { PlusSquareOutlined } from "@ant-design/icons";
import Provider from "./Provider";
const ModelService: React.FC = () => {
  const items = [
    {
      key: "markpdfdown",
      label: "MarkPDFdown",
      children: <Provider />,
    },
    {
      key: "openrouter",
      label: "OpenRouter",
      children: "Content of Tab 2",
    },
    {
      key: "tencentcloud-ti",
      label: "腾讯云TI",
      children: "Content of Tab 3",
    },
    {
      key: "add provider",
      label: "添加服务商",
      icon: <PlusSquareOutlined />,
      children: <AddProvider />,
    },
  ];

  return (
    <ConfigProvider
      theme={{
        components: {
          Tabs: {
            verticalItemPadding: "8px 16px 8px 0",
          },
        },
      }}
    >
      <Tabs
        style={{ height: "calc(100vh - 180px)" }}
        defaultActiveKey="markpdfdown"
        tabPosition="left"
        items={items}
      />
    </ConfigProvider>
  );
};

export default ModelService;
