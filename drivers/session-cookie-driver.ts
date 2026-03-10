import { LocaleDriver } from '@18ways/core/locale-engine';
import { readCookieFromDocument, writeCookieToDocument } from '@18ways/core/cookie-utils';
import {
  WAYS_LOCALE_COOKIE_NAME,
  WAYS_SESSION_LOCALE_COOKIE_NAME,
  recognizeLocale,
} from '@18ways/core/i18n-shared';
import type {
  NextLocaleCookieWriteOptions,
  NextLocaleDriverContext,
} from './next-locale-driver-types';

const PREFERENCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const COOKIE_CONSENT_COOKIE_NAME = '18ways_cookie_consent';
const FUNCTIONAL_CONSENT_CATEGORY = 'functional';

const writeLocaleCookieToDocument = (
  cookieName: string,
  locale: string,
  options?: NextLocaleCookieWriteOptions
): void => {
  writeCookieToDocument(cookieName, locale, options);
};

const hasFunctionalConsent = (rawConsentCookie: string | null | undefined): boolean => {
  if (!rawConsentCookie) {
    return false;
  }

  let decodedConsentCookie = rawConsentCookie;
  try {
    decodedConsentCookie = decodeURIComponent(rawConsentCookie);
  } catch {
    decodedConsentCookie = rawConsentCookie;
  }

  try {
    const parsed = JSON.parse(decodedConsentCookie) as Record<string, unknown>;
    const categories = parsed.categories;
    if (Array.isArray(categories)) {
      return categories.includes(FUNCTIONAL_CONSENT_CATEGORY);
    }

    if (typeof categories === 'object' && categories !== null) {
      return (categories as Record<string, unknown>)[FUNCTIONAL_CONSENT_CATEGORY] === true;
    }

    if (Array.isArray(parsed.acceptedCategories)) {
      return parsed.acceptedCategories.includes(FUNCTIONAL_CONSENT_CATEGORY);
    }

    return false;
  } catch {
    return decodedConsentCookie.includes(`"${FUNCTIONAL_CONSENT_CATEGORY}"`);
  }
};

export const SessionCookieDriver: LocaleDriver<NextLocaleDriverContext> = {
  name: 'session-cookie',
  getLocale: (context) => {
    const readCookie = context.readCookie || readCookieFromDocument;

    const fromSession = recognizeLocale(readCookie(WAYS_SESSION_LOCALE_COOKIE_NAME));
    if (fromSession) {
      return fromSession;
    }

    return recognizeLocale(readCookie(WAYS_LOCALE_COOKIE_NAME));
  },
  setLocale: async (locale, context) => {
    const tasks: Array<Promise<void>> = [];
    const writeCookie = context.writeCookie || writeLocaleCookieToDocument;
    const readCookie = context.readCookie || readCookieFromDocument;
    const functionalConsentGranted = hasFunctionalConsent(readCookie(COOKIE_CONSENT_COOKIE_NAME));

    if (functionalConsentGranted) {
      tasks.push(
        Promise.resolve(
          writeCookie(WAYS_SESSION_LOCALE_COOKIE_NAME, locale, {
            sameSite: 'lax',
            path: '/',
          })
        )
      );
      tasks.push(
        Promise.resolve(
          writeCookie(WAYS_LOCALE_COOKIE_NAME, locale, {
            maxAge: PREFERENCE_COOKIE_MAX_AGE_SECONDS,
            sameSite: 'lax',
            path: '/',
          })
        )
      );
    }

    if (context.setCurrentLocale) {
      tasks.push(Promise.resolve(context.setCurrentLocale(locale)));
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  },
  handleListeners: () => {},
};
