import { useContext } from 'react';
import { I18nContext } from '../contexts/I18nContextDefinition';

export const useLanguage = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useLanguage must be used within I18nProvider');
  }
  return context;
};
