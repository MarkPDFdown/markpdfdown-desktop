import React, { useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import type { Locale } from 'antd/es/locale';
import { I18nContext } from './I18nContextDefinition';

type Language = 'en-US' | 'zh-CN';

interface I18nProviderProps {
  children: ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState<Language>(
    (localStorage.getItem('app_language') as Language) || 'en-US'
  );

  // Map language to Ant Design locale
  const getAntdLocale = (lang: Language): Locale => {
    switch (lang) {
      case 'zh-CN':
        return zhCN;
      case 'en-US':
      default:
        return enUS;
    }
  };

  const [antdLocale, setAntdLocale] = useState<Locale>(getAntdLocale(language));

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    setAntdLocale(getAntdLocale(lang));
    localStorage.setItem('app_language', lang);
    i18n.changeLanguage(lang);
  };

  useEffect(() => {
    // Sync initial language with i18next
    i18n.changeLanguage(language);
  }, [i18n, language]);

  return (
    <I18nContext.Provider value={{ language, changeLanguage, antdLocale }}>
      {children}
    </I18nContext.Provider>
  );
};
