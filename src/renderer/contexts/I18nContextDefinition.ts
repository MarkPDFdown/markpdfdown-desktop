import { createContext } from 'react';
import type { Locale } from 'antd/es/locale';

type Language = 'en-US' | 'zh-CN';

export interface I18nContextType {
  language: Language;
  changeLanguage: (lang: Language) => void;
  antdLocale: Locale;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);
