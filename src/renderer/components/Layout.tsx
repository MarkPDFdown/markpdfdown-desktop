import React, { CSSProperties, useState } from "react";
import { ConfigProvider, Layout, Menu, Modal, theme } from "antd";
import {
  HomeOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  GithubOutlined,
  CloseOutlined,
  MinusOutlined,
  BorderOutlined
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../hooks/useLanguage";
import ImgLogo from "../assets/MarkPDFdown.png";

const { Header, Sider, Content, Footer } = Layout;

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  path: string;
};

// 扩展样式类型以支持特殊的CSS属性
interface CustomCSSProperties extends CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

// macOS 风格的窗口控制按钮组件
const WindowControls: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const buttonBaseStyle: CSSProperties = {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8px',
    color: 'rgba(0, 0, 0, 0.6)',
    transition: 'all 0.2s',
  };

  const handleClose = () => {
    onClose();
  };

  const handleMinimize = () => {
    if (window.api?.window) {
      window.api.window.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.api?.window) {
      window.api.window.maximize();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '12px',
        WebkitAppRegion: 'no-drag',
      }}
    >
      {/* 关闭按钮 */}
      <div
        style={{
          ...buttonBaseStyle,
          backgroundColor: '#ff5f57',
        }}
        onMouseEnter={() => setHoveredButton('close')}
        onMouseLeave={() => setHoveredButton(null)}
        onClick={handleClose}
      >
        {hoveredButton === 'close' && <CloseOutlined />}
      </div>

      {/* 最小化按钮 */}
      <div
        style={{
          ...buttonBaseStyle,
          backgroundColor: '#ffbd2e',
        }}
        onMouseEnter={() => setHoveredButton('minimize')}
        onMouseLeave={() => setHoveredButton(null)}
        onClick={handleMinimize}
      >
        {hoveredButton === 'minimize' && <MinusOutlined />}
      </div>

      {/* 最大化按钮 */}
      <div
        style={{
          ...buttonBaseStyle,
          backgroundColor: '#28c840',
        }}
        onMouseEnter={() => setHoveredButton('maximize')}
        onMouseLeave={() => setHoveredButton(null)}
        onClick={handleMaximize}
      >
        {hoveredButton === 'maximize' && <BorderOutlined />}
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const { antdLocale } = useLanguage();
  const {
    token: { colorBgContainer, borderRadiusLG, colorBgLayout },
  } = theme.useToken();

  // 检测平台，非 macOS 平台显示自定义窗口控制按钮
  const isNotMac = window.api?.platform !== 'darwin';

  // 处理窗口关闭，检查是否有进行中的任务
  const handleWindowClose = async () => {
    try {
      const result = await window.api?.task?.hasRunningTasks();
      if (result?.success && result.data?.hasRunning) {
        Modal.confirm({
          title: t('closeConfirm.title'),
          content: t('closeConfirm.content', { count: result.data.count }),
          okText: t('common.confirm'),
          cancelText: t('common.cancel'),
          okButtonProps: { danger: true },
          onOk: () => {
            window.api?.window?.close();
          },
        });
      } else {
        window.api?.window?.close();
      }
    } catch (error) {
      // 如果检查失败，直接关闭
      window.api?.window?.close();
    }
  };

  const menuItems: MenuItem[] = [
    {
      key: "1",
      icon: <HomeOutlined />,
      label: t('navigation.home'),
      path: "/",
    },
    {
      key: "2",
      icon: <UnorderedListOutlined />,
      label: t('navigation.list'),
      path: "/list",
    },
    {
      key: "3",
      icon: <SettingOutlined />,
      label: t('navigation.settings'),
      path: "/settings",
    },
  ];

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    // 在使用HashRouter时，location.pathname 可能不会正确更新
    // 手动从location.hash中获取实际路径
    const hash = location.hash;
    const hashPath = hash.startsWith('#') ? hash.substring(1) : '';
    const currentPath = hashPath || location.pathname;
    
    // console.log('Current path:', currentPath); // 调试用
    
    // 检查是否为子路径
    for (const item of menuItems) {
      // 如果当前路径以某个菜单项的路径为开头，则选中该菜单项
      if (currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path))) {
        return item.key;
      }
    }
    
    // 如果没有匹配，则默认选中首页
    return "1";
  };

  // 定义自定义样式
  const headerStyle: CustomCSSProperties = {
    WebkitAppRegion: 'drag'
  };
  
  // 打开外部链接
  const openExternalLink = (url: string) => {
    if (window.electron?.ipcRenderer) {
      // 使用通过上下文桥接口提供的IPC
      window.electron.ipcRenderer.send('open-external-link', url);
    } else {
      // 降级为普通链接（在浏览器中运行时）
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        components: {
          Menu: {
            itemMarginInline: 18,
          },
          Layout: {
            footerPadding: "12px 50px",
            headerHeight: "20px",
            headerBg: colorBgLayout,
          },
        },
      }}
    >
      <Layout
        style={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          flexDirection: "row",
        }}
      >
        <Sider collapsed={true} defaultCollapsed={true} style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10
        }}>
          {/* Windows/Linux 显示自定义窗口控制按钮 */}
          {isNotMac && <WindowControls onClose={handleWindowClose} />}

          <div
            style={{
              margin: isNotMac ? "12px 16px 16px" : "48px 16px 16px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: borderRadiusLG,
              overflow: "hidden",
            }}
          >
            <img
              src={ImgLogo}
              alt="MarkPDFdown"
              style={{ width: "48px", height: "48px" }}
              draggable={false}
            />
          </div>

          <Menu
            theme="dark"
            selectedKeys={[getSelectedKey()]}
            mode="inline"
            items={menuItems.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
            }))}
            onClick={({ key }) => {
              const selectedItem = menuItems.find((item) => item.key === key);
              if (selectedItem) {
                navigate(selectedItem.path);
              }
            }}
          />
          
          <div style={{ 
            position: 'absolute',
            bottom: '24px',
            left: 0,
            right: 0,
            display: 'flex', 
            justifyContent: 'center',
            padding: '16px 0'
          }}>
            <div
              onClick={() => openExternalLink('https://github.com/MarkPDFdown/desktop')}
              style={{ 
                color: 'rgba(255, 255, 255, 0.65)', 
                fontSize: '20px', 
                transition: 'color 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)'}
            >
              <GithubOutlined />
            </div>
          </div>
        </Sider>

        <Layout style={{ flex: "1 1 auto", marginLeft: '80px', minWidth: 0, overflow: "hidden" }}>
          <Header style={{
            ...headerStyle,
            position: 'fixed',
            width: 'calc(100% - 80px)',
            top: 0,
            right: 0,
            zIndex: 9,
            background: colorBgLayout,
            // Windows/Linux 平台启用拖拽功能
            ...(isNotMac ? { WebkitAppRegion: 'drag' as const } : {})
          }}>
          </Header>
          <Content
            style={{
              margin: "20px 16px 0",
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              flex: "1 1 auto",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 24, height: "100%", overflow: "hidden" }}>
              <Outlet />
            </div>
          </Content>
          <Footer style={{ textAlign: "center" }}>
            {t('common.copyright', { year: new Date().getFullYear() })}
          </Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default AppLayout;
