import { LocaleEngine } from '@18ways/core/locale-engine';
import { canonicalizeLocale, findSupportedLocale, recognizeLocale } from '@18ways/core/i18n-shared';
import {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  PathLocaleDriver,
  SessionCookieDriver,
  createNextLocaleDrivers,
  type NextLocaleCookieWriteOptions,
  type NextLocaleDriverContext,
  type PathLocaleResolution,
} from './drivers';

export {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  PathLocaleDriver,
  SessionCookieDriver,
  createNextLocaleDrivers,
  type NextLocaleCookieWriteOptions,
  type NextLocaleDriverContext,
  type PathLocaleResolution,
};

const normalizeAcceptedLocales = (acceptedLocales?: string[]): string[] => {
  if (!acceptedLocales?.length) {
    return [];
  }

  return Array.from(
    new Set(
      acceptedLocales
        .map((locale) => recognizeLocale(locale))
        .filter((locale): locale is string => Boolean(locale))
        .map((locale) => canonicalizeLocale(locale))
    )
  );
};

export const createNextLocaleEngine = <TContext extends NextLocaleDriverContext>(options: {
  baseLocale: string;
  acceptedLocales?: string[];
}): LocaleEngine<TContext> => {
  const acceptedLocales = normalizeAcceptedLocales(options.acceptedLocales);
  const normalizedBaseLocale = recognizeLocale(options.baseLocale) || 'en-GB';
  const effectiveBaseLocale =
    (acceptedLocales.length
      ? findSupportedLocale(normalizedBaseLocale, acceptedLocales) || acceptedLocales[0]
      : normalizedBaseLocale) || 'en-GB';

  return new LocaleEngine<TContext>({
    baseLocale: effectiveBaseLocale,
    drivers: createNextLocaleDrivers<TContext>(),
    normalizeLocale: (locale) => {
      const recognized = recognizeLocale(locale);
      if (!recognized) {
        return '';
      }

      if (!acceptedLocales.length) {
        return recognized;
      }

      return findSupportedLocale(recognized, acceptedLocales) || '';
    },
  });
};
