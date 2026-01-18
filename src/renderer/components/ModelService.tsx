import React, { useState, useEffect, useCallback } from "react";
import { ConfigProvider, Tabs } from "antd";
import AddProvider from "./AddProvider";
import { PlusSquareOutlined, CloudOutlined } from "@ant-design/icons";
import Provider from "./Provider";

interface ProviderData {
  id: number;
  name: string;
  type: string;
  api_key: string;
  base_url: string;
  suffix: string;
  status: number;
}

interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const ModelService: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string>("add provider");
  const [items, setItems] = useState<TabItem[]>([
    {
      key: "add provider",
      label: "添加服务商",
      icon: <PlusSquareOutlined />,
      children: <AddProvider onProviderAdded={handleProviderAdded} />,
    },
  ]);

  // 定义获取服务商列表的函数
  const fetchProviders = useCallback(async () => {
    try {
      const response = await window.api.provider.getAll();

      if (!response.success) {
        throw new Error(response.error || "获取服务商列表失败");
      }

      const providers: ProviderData[] = response.data;

      // 构建选项卡数据
      const providerTabs = providers.map((provider) => ({
        key: provider.id.toString(),
        label: provider.name,
        icon: <CloudOutlined />,
        children: (
          <Provider
            providerId={provider.id}
            onProviderDeleted={handleProviderDeleted}
          />
        ),
      }));

      // 更新添加服务商的选项卡
      const addProviderTab = {
        key: "add provider",
        label: "添加服务商",
        icon: <PlusSquareOutlined />,
        children: <AddProvider onProviderAdded={handleProviderAdded} />,
      };

      // 合并服务商选项卡和"添加服务商"选项卡
      setItems([...providerTabs, addProviderTab]);

      // 如果有服务商,自动切换到第一个服务商标签
      if (providerTabs.length > 0 && activeKey === "add provider") {
        setActiveKey(providerTabs[0].key);
      }
    } catch (error) {
      console.error("获取服务商列表出错:", error);
    }
  }, []);

  // 处理添加服务商成功的函数
  function handleProviderAdded(providerId: string) {
    // 刷新服务商列表
    fetchProviders().then(() => {
      // 切换到新添加的服务商标签
      setActiveKey(providerId);
    });
  }

  // 处理删除服务商成功的函数
  function handleProviderDeleted() {
    // 刷新服务商列表,完成后选中第一个服务商(如果有)
    fetchProviders().then(async () => {
      try {
        // 直接获取最新的服务商列表数据
        const response = await window.api.provider.getAll();

        if (!response.success) {
          throw new Error(response.error || "获取服务商列表失败");
        }

        const providers: ProviderData[] = response.data;

        // 如果有服务商,则选中第一个
        if (providers.length > 0) {
          setActiveKey(providers[0].id.toString());
        } else {
          // 如果没有服务商了,则选中"添加服务商"选项卡
          setActiveKey("add provider");
        }
      } catch (error) {
        console.error("获取服务商列表失败:", error);
        // 出错时默认选中添加服务商选项卡
        setActiveKey("add provider");
      }
    });
  }

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

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
        activeKey={activeKey}
        onChange={setActiveKey}
        tabPosition="left"
        items={items}
      />
    </ConfigProvider>
  );
};

export default ModelService;
