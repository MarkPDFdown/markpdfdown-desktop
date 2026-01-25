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
    {
      key: 'ja-JP',
      label: '🇯🇵 日本語',
    },
    {
      key: 'ru-RU',
      label: '🇷🇺 Русский',
    },
    {
      key: 'fa-IR',
      label: '🇮🇷 فارسی',
    },
    {
      key: 'ar-SA',
      label: '🇸🇦 العربية',
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    changeLanguage(e.key as 'en-US' | 'zh-CN' | 'ja-JP' | 'ru-RU' | 'fa-IR' | 'ar-SA');
  };

  const getCurrentLabel = (lang: string) => {
    switch (lang) {
      case 'zh-CN':
        return '简体中文';
      case 'ja-JP':
        return '日本語';
      case 'ru-RU':
        return 'Русский';
      case 'fa-IR':
        return 'فارسی';
      case 'ar-SA':
        return 'العربية';
      default:
        return 'English';
    }
  };

  const currentLabel = getCurrentLabel(language);

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
