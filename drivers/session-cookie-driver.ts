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

const writeLocaleCookieToDocument = (
  cookieName: string,
  locale: string,
  options?: NextLocaleCookieWriteOptions
): void => {
  writeCookieToDocument(cookieName, locale, options);
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

    if (context.setCurrentLocale) {
      tasks.push(Promise.resolve(context.setCurrentLocale(locale)));
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  },
  handleListeners: () => {},
};
