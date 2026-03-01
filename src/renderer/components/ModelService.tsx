import React, { useState, useEffect, useCallback, useRef } from "react";
import { ConfigProvider, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import AddProvider from "./AddProvider";
import { PlusSquareOutlined } from "@ant-design/icons";
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

interface ProviderPreset {
  name: string;
  type: string;
}

interface TabItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const ModelService: React.FC = () => {
  const { t } = useTranslation("provider");
  const [activeKey, setActiveKey] = useState<string>("add provider");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [items, setItems] = useState<TabItem[]>([
    {
      key: "add provider",
      label: t("add_provider.tab_label"),
      icon: <PlusSquareOutlined />,
      children: <AddProvider onProviderAdded={() => {}} />,
    },
  ]);

  // 使用 ref 来存储回调函数，避免循环依赖
  const handleProviderAddedRef = useRef<(providerId: string) => void>((providerId) => {
    setActiveKey(providerId);
  });
  const handleProviderDeletedRef = useRef<() => void>(() => {});
  const handleStatusChangedRef = useRef<() => void>(() => {});
  const fetchProvidersRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // 定义获取服务商列表的函数
  const fetchProviders = useCallback(async () => {
    try {
      const [response, presetsResponse] = await Promise.all([
        window.api.provider.getAll(),
        window.api.provider.getPresets(),
      ]);

      if (!response.success) {
        throw new Error(response.error || t("messages.fetch_providers_failed"));
      }

      const providers: ProviderData[] = response.data;
      const presets: ProviderPreset[] = presetsResponse.success ? presetsResponse.data : [];

      // 按预设顺序排序：预设服务商在前（按 providerPresets 数组顺序），非预设服务商在后
      const getPresetIndex = (provider: ProviderData): number => {
        const index = presets.findIndex(
          (preset) => preset.type === provider.type && preset.name === provider.name
        );
        return index === -1 ? presets.length : index;
      };

      const sortedProviders = [...providers].sort((a, b) => {
        const indexA = getPresetIndex(a);
        const indexB = getPresetIndex(b);
        return indexA - indexB;
      });

      // 构建选项卡数据
      const providerTabs = sortedProviders.map((provider) => {
        const isPreset = presets.some(
          (preset) => preset.type === provider.type && preset.name === provider.name
        );
        const isEnabled = provider.status === 0;
        return {
          key: provider.id.toString(),
          label: (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className={
                  isEnabled
                    ? "provider-status-light provider-status-light--enabled"
                    : "provider-status-light provider-status-light--disabled"
                }
              />
              {provider.name}
            </span>
          ),
          children: (
            <Provider
              providerId={provider.id}
              onProviderDeleted={handleProviderDeletedRef.current}
              onStatusChanged={handleStatusChangedRef.current}
              isPreset={isPreset}
            />
          ),
        };
      });

      // 更新添加服务商的选项卡
      const addProviderTab = {
        key: "add provider",
        label: t("add_provider.tab_label"),
        icon: <PlusSquareOutlined />,
        children: <AddProvider onProviderAdded={handleProviderAddedRef.current} />,
      };

      // 合并服务商选项卡和"添加服务商"选项卡
      setItems([...providerTabs, addProviderTab]);

      // 只在初始加载时自动切换到第一个服务商
      if (isInitialLoad && activeKey === "add provider") {
        if (providers.length > 0) {
           setActiveKey(providers[0].id.toString());
        }
        setIsInitialLoad(false);
      }
    } catch (error) {
      console.error("Failed to fetch provider list:", error);
    }
  }, [activeKey, isInitialLoad, t]);

  // 处理添加服务商成功的函数
  const handleProviderAdded = useCallback((providerId: string) => {
    // 刷新服务商列表
    fetchProviders().then(() => {
      // 切换到新添加的服务商标签
      setActiveKey(providerId);
    });
  }, [fetchProviders]);

  // 处理服务商状态变更的函数（启用/禁用切换）
  const handleStatusChanged = useCallback(() => {
    fetchProviders();
  }, [fetchProviders]);

  // 处理删除服务商成功的函数
  const handleProviderDeleted = useCallback(() => {
    // 使用 ref 调用 fetchProviders，避免循环依赖
    fetchProvidersRef.current().then(async () => {
      try {
        // 直接获取最新的服务商列表数据
        const response = await window.api.provider.getAll();

        if (!response.success) {
          throw new Error(response.error || t("messages.fetch_providers_failed"));
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
        console.error("Failed to fetch provider list:", error);
        // 出错时默认选中添加服务商选项卡
        setActiveKey("add provider");
      }
    });
  }, [t]);

  // 同步回调到 ref
  useEffect(() => {
    handleProviderAddedRef.current = handleProviderAdded;
  }, [handleProviderAdded]);

  useEffect(() => {
    handleProviderDeletedRef.current = handleProviderDeleted;
  }, [handleProviderDeleted]);

  useEffect(() => {
    handleStatusChangedRef.current = handleStatusChanged;
  }, [handleStatusChanged]);

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
        className="model-service-tabs"
      />
    </ConfigProvider>
  );
};

export default ModelService;
