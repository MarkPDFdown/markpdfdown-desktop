import React, { CSSProperties } from "react";
import { ConfigProvider, Layout, Menu, theme } from "antd";
import {
  HomeOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  GithubOutlined
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
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

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG, colorBgLayout },
  } = theme.useToken();

  const menuItems: MenuItem[] = [
    {
      key: "1",
      icon: <HomeOutlined />,
      label: "主页",
      path: "/",
    },
    {
      key: "2",
      icon: <UnorderedListOutlined />,
      label: "列表",
      path: "/list",
    },
    {
      key: "3",
      icon: <SettingOutlined />,
      label: "设置",
      path: "/settings",
    },
  ];

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    const currentPath = location.pathname;
    
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
          <div
            style={{
              margin: "48px 16px 16px",
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
            defaultSelectedKeys={[getSelectedKey()]}
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

        <Layout style={{ flex: "1 1 auto", width: "100%", marginLeft: '80px' }}>
          <Header style={{
            ...headerStyle,
            position: 'fixed',
            width: 'calc(100% - 80px)',
            top: 0,
            right: 0,
            zIndex: 9,
            background: colorBgLayout
          }}></Header>
          <Content
            style={{
              margin: "20px 16px 0",
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              flex: "1 1 auto",
            }}
          >
            <div style={{ padding: 24, height: "100%" }}>
              <Outlet />
            </div>
          </Content>
          <Footer style={{ textAlign: "center" }}>
            Copyright &copy; {new Date().getFullYear()} MarkPDFdown All Rights
            Reserved.
          </Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default AppLayout;
