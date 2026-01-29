import React from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { useTranslation } from "react-i18next";
import ModelService from "../components/ModelService";
import { ApiOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import About from "../components/About";
import AccountCenter from "../components/AccountCenter";

const Settings: React.FC = () => {
  const { t } = useTranslation('settings');

  const items: TabsProps["items"] = [
    {
      key: "3",
      label: "Account", // TODO: Add translation key 'tabs.account'
      icon: <UserOutlined />,
      children: <AccountCenter />,
    },
    {
      key: "1",
      label: t('tabs.model_service'),
      icon: <ApiOutlined />,
      children: <ModelService />,
    },
    {
      key: "2",
      label: t('tabs.about'),
      icon: <MailOutlined />,
      children: <About />,
    },
  ];
  return <Tabs defaultActiveKey="3" items={items} />;
};

export default Settings;
