import React from 'react';
import { Dropdown, Button } from 'antd';
import type { MenuProps } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useLanguage } from '../hooks/useLanguage';

const LanguageSwitcher: React.FC = () => {
  const { language, changeLanguage } = useLanguage();

  const items: MenuProps['items'] = [
    {
      key: 'en-US',
      label: '🇺🇸 English',
    },
    {
      key: 'zh-CN',
      label: '🇨🇳 简体中文',
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    changeLanguage(e.key);
  };

  const currentLabel = language === 'zh-CN' ? '简体中文' : 'English';

  return (
    <Dropdown menu={{ items, onClick: handleMenuClick }} placement="bottomRight">
      <Button
        type="text"
        icon={<GlobalOutlined />}
      >
        {currentLabel}
      </Button>
    </Dropdown>
  );
};

export default LanguageSwitcher;
