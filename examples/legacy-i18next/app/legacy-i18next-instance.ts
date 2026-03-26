'use client';

import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ACCEPTED_LOCALES, BASE_LOCALE, type Locale } from './i18n';
import englishLegacyCopy from './locales/en-US/legacy.json';
import caesarLegacyCopy from './locales/en-US-x-caesar/legacy.json';

const resources = {
  [BASE_LOCALE]: {
    legacy: englishLegacyCopy,
  },
  'en-US-x-caesar': {
    legacy: caesarLegacyCopy,
  },
} as const;

export const createLegacyI18nInstance = (locale: Locale): I18nInstance => {
  const instance = createInstance();

  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: BASE_LOCALE,
    supportedLngs: [...ACCEPTED_LOCALES],
    resources,
    defaultNS: 'legacy',
    ns: ['legacy'],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    initImmediate: false,
  });

  return instance;
};
