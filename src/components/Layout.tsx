import React, { useState } from 'react';
import { Layout, Menu, theme } from 'antd';
import { HomeOutlined, UnorderedListOutlined, SettingOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Sider, Content, Footer } = Layout;

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  path: string;
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems: MenuItem[] = [
    {
      key: '1',
      icon: <HomeOutlined />,
      label: '主页',
      path: '/',
    },
    {
      key: '2',
      icon: <UnorderedListOutlined />,
      label: '列表',
      path: '/list',
    },
    {
      key: '3',
      icon: <SettingOutlined />,
      label: '设置',
      path: '/settings',
    },
  ];

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    const currentPath = location.pathname;
    const item = menuItems.find(item => item.path === currentPath);
    return item ? item.key : '1';
  };

  return (
    <Layout style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'row' }}>
      <Sider collapsed={true} defaultCollapsed={true}>
        <div style={{ height: '48px', margin: '16px', background: 'rgba(255, 255, 255, .2)', borderRadius: '6px'}} />
        <Menu
          theme="dark"
          defaultSelectedKeys={[getSelectedKey()]}
          mode="inline"
          items={menuItems.map(item => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
          }))}
          onClick={({ key }) => {
            const selectedItem = menuItems.find(item => item.key === key);
            if (selectedItem) {
              navigate(selectedItem.path);
            }
          }}
        />
      </Sider>
      <Layout style={{ flex: '1 1 auto', width: '100%' }}>
        <Content style={{ margin: '16px 16px 0', background: colorBgContainer, borderRadius: borderRadiusLG, flex: '1 1 auto' }}>
          <div style={{ padding: 24, height: '100%' }}>
              <Outlet />
            </div>
        </Content>
        <Footer style={{ textAlign: 'center' }}>Copyright &copy; {new Date().getFullYear()} MarkPDFdown All Rights Reserved.</Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout; 