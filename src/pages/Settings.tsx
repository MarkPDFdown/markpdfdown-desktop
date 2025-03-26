import React from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import ModelService from "../components/ModelService";
import { ApiOutlined, MailOutlined } from "@ant-design/icons";
import About from "../components/About";
const Settings: React.FC = () => {
  const items: TabsProps["items"] = [
    {
      key: "1",
      label: "模型服务",
      icon: <ApiOutlined />,
      children: <ModelService />,
    },
    {
      key: "2",
      label: "关于我们",
      icon: <MailOutlined />,
      children: <About />,
    },
  ];
  return (
    <div>
      <Tabs defaultActiveKey="1" items={items} />
    </div>
  );
};

export default Settings;
