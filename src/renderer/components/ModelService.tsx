import React, { useState, useEffect, useCallback, useRef } from "react";
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
      children: <AddProvider onProviderAdded={() => {}} />,
    },
  ]);

  // 使用 ref 来存储回调函数，避免循环依赖
  const handleProviderAddedRef = useRef<(providerId: string) => void>(() => {});
  const handleProviderDeletedRef = useRef<() => void>(() => {});

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
            onProviderDeleted={handleProviderDeletedRef.current}
          />
        ),
      }));

      // 更新添加服务商的选项卡
      const addProviderTab = {
        key: "add provider",
        label: "添加服务商",
        icon: <PlusSquareOutlined />,
        children: <AddProvider onProviderAdded={handleProviderAddedRef.current} />,
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
  }, [activeKey]);

  // 处理添加服务商成功的函数
  const handleProviderAdded = useCallback((providerId: string) => {
    // 刷新服务商列表
    fetchProviders().then(() => {
      // 切换到新添加的服务商标签
      setActiveKey(providerId);
    });
  }, [fetchProviders]);

  // 处理删除服务商成功的函数
  const handleProviderDeleted = useCallback(() => {
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
  }, [fetchProviders]);

  // 更新 ref，确保初始 items 能正确引用回调
  useEffect(() => {
    handleProviderAddedRef.current = handleProviderAdded;
  }, [handleProviderAdded]);

  useEffect(() => {
    handleProviderDeletedRef.current = handleProviderDeleted;
  }, [handleProviderDeleted]);

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
