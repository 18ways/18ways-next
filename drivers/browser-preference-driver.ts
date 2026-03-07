import { LocaleDriver } from '@18ways/core/locale-engine';
import { recognizeLocale } from '@18ways/core/i18n-shared';
import type { NextLocaleDriverContext } from './next-locale-driver-types';

const readBrowserPreferredLocale = (): string | null => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    const locale = recognizeLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return null;
};

const parseAcceptLanguageLocale = (header: string | null | undefined): string | null => {
  if (!header) {
    return null;
  }

  const tokens = header
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.split(';')[0]?.trim())
    .filter((token): token is string => Boolean(token));

  for (const token of tokens) {
    const recognized = recognizeLocale(token);
    if (recognized) {
      return recognized;
    }
  }

  return null;
};

export const BrowserPreferenceDriver: LocaleDriver<NextLocaleDriverContext> = {
  name: 'browser-preference',
  getLocale: (context) => {
    const fromHeader = parseAcceptLanguageLocale(context.acceptLanguageHeader);
    if (fromHeader) {
      return fromHeader;
    }

    return readBrowserPreferredLocale();
  },
  setLocale: () => {},
  handleListeners: (_context, sync) => {
    if (typeof window === 'undefined') {
      return;
    }

    let scheduledSync: number | null = null;

    const scheduleSync = (locale: string) => {
      if (scheduledSync !== null) {
        window.clearTimeout(scheduledSync);
      }

      scheduledSync = window.setTimeout(() => {
        scheduledSync = null;
        void sync(locale);
      }, 0);
    };

    const handleLanguageChange = () => {
      const locale = readBrowserPreferredLocale();
      if (!locale) {
        return;
      }

      scheduleSync(locale);
    };

    window.addEventListener('languagechange', handleLanguageChange);

    return () => {
      window.removeEventListener('languagechange', handleLanguageChange);
      if (scheduledSync !== null) {
        window.clearTimeout(scheduledSync);
      }
    };
  },
};
