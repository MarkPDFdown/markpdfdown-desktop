import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import English translations
import enCommon from './en-US/common.json';
import enHome from './en-US/home.json';
import enList from './en-US/list.json';
import enUpload from './en-US/upload.json';
import enProvider from './en-US/provider.json';
import enSettings from './en-US/settings.json';

// Import Chinese translations
import zhCommon from './zh-CN/common.json';
import zhHome from './zh-CN/home.json';
import zhList from './zh-CN/list.json';
import zhUpload from './zh-CN/upload.json';
import zhProvider from './zh-CN/provider.json';
import zhSettings from './zh-CN/settings.json';

const resources = {
  'en-US': {
    common: enCommon,
    home: enHome,
    list: enList,
    upload: enUpload,
    provider: enProvider,
    settings: enSettings,
  },
  'zh-CN': {
    common: zhCommon,
    home: zhHome,
    list: zhList,
    upload: zhUpload,
    provider: zhProvider,
    settings: zhSettings,
  },
};

// Get saved language from localStorage or default to English
const savedLanguage = localStorage.getItem('app_language') || 'en-US';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en-US',
    defaultNS: 'common',
    ns: ['common', 'home', 'list', 'upload', 'provider', 'settings'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
