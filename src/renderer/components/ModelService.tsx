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
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [items, setItems] = useState<TabItem[]>([
    {
      key: "add provider",
      label: "添加服务商",
      icon: <PlusSquareOutlined />,
      children: <AddProvider onProviderAdded={() => {}} />,
    },
  ]);

  // 使用 ref 来存储回调函数，避免循环依赖
  const handleProviderAddedRef = useRef<(providerId: string) => void>((providerId) => {
    setActiveKey(providerId);
  });
  const handleProviderDeletedRef = useRef<() => void>(() => {});
  const fetchProvidersRef = useRef<() => Promise<void>>(() => Promise.resolve());

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

      // 只在初始加载时自动切换到第一个服务商，避免添加后跳转
      if (isInitialLoad && providerTabs.length > 0 && activeKey === "add provider") {
        setActiveKey(providerTabs[0].key);
        setIsInitialLoad(false);
      }
    } catch (error) {
      console.error("获取服务商列表出错:", error);
    }
  }, [activeKey, isInitialLoad]);

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
    // 使用 ref 调用 fetchProviders，避免循环依赖
    fetchProvidersRef.current().then(async () => {
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
  }, []);

  // 同步回调到 ref
  useEffect(() => {
    handleProviderAddedRef.current = handleProviderAdded;
  }, [handleProviderAdded]);

  useEffect(() => {
    handleProviderDeletedRef.current = handleProviderDeleted;
  }, [handleProviderDeleted]);

  useEffect(() => {
    fetchProvidersRef.current = fetchProviders;
  }, [fetchProviders]);

  // 初始加载
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
