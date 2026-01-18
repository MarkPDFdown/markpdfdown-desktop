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

// Import Japanese translations
import jaCommon from './ja-JP/common.json';
import jaHome from './ja-JP/home.json';
import jaList from './ja-JP/list.json';
import jaUpload from './ja-JP/upload.json';
import jaProvider from './ja-JP/provider.json';
import jaSettings from './ja-JP/settings.json';

// Import Russian translations
import ruCommon from './ru-RU/common.json';
import ruHome from './ru-RU/home.json';
import ruList from './ru-RU/list.json';
import ruUpload from './ru-RU/upload.json';
import ruProvider from './ru-RU/provider.json';
import ruSettings from './ru-RU/settings.json';

// Import Persian translations
import faCommon from './fa-IR/common.json';
import faHome from './fa-IR/home.json';
import faList from './fa-IR/list.json';
import faUpload from './fa-IR/upload.json';
import faProvider from './fa-IR/provider.json';
import faSettings from './fa-IR/settings.json';

// Import Arabic translations
import arCommon from './ar-SA/common.json';
import arHome from './ar-SA/home.json';
import arList from './ar-SA/list.json';
import arUpload from './ar-SA/upload.json';
import arProvider from './ar-SA/provider.json';
import arSettings from './ar-SA/settings.json';

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
  'ja-JP': {
    common: jaCommon,
    home: jaHome,
    list: jaList,
    upload: jaUpload,
    provider: jaProvider,
    settings: jaSettings,
  },
  'ru-RU': {
    common: ruCommon,
    home: ruHome,
    list: ruList,
    upload: ruUpload,
    provider: ruProvider,
    settings: ruSettings,
  },
  'fa-IR': {
    common: faCommon,
    home: faHome,
    list: faList,
    upload: faUpload,
    provider: faProvider,
    settings: faSettings,
  },
  'ar-SA': {
    common: arCommon,
    home: arHome,
    list: arList,
    upload: arUpload,
    provider: arProvider,
    settings: arSettings,
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
