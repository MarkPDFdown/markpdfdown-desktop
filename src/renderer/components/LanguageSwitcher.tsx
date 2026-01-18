import React from 'react';
import { Select } from 'antd';
import { useLanguage } from '../hooks/useLanguage';

const LanguageSwitcher: React.FC = () => {
  const { language, changeLanguage } = useLanguage();

  const options = [
    {
      value: 'en-US',
      label: '🇺🇸 English',
    },
    {
      value: 'zh-CN',
      label: '🇨🇳 简体中文',
    },
  ];

  return (
    <Select
      value={language}
      onChange={changeLanguage}
      options={options}
      style={{ width: 140 }}
      size="small"
    />
  );
};

export default LanguageSwitcher;
