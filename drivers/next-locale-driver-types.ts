import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';

export type Awaitable<T> = T | Promise<T>;

export type NextLocaleCookieWriteOptions = {
  maxAge?: number;
  sameSite?: 'lax';
  secure?: boolean;
  path?: string;
};

export type PathLocaleResolution = {
  unlocalizedPathname: string;
  localizedPathname: string;
  rewritePathname?: string;
  redirectPathname?: string;
};

export type NextLocaleDriverContext = {
  pathname: string;
  baseLocale: string;
  supportedLocales?: string[];
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  currentLocale?: string;
  readCookie?: (cookieName: string) => string | null | undefined;
  writeCookie?: (
    cookieName: string,
    locale: string,
    options?: NextLocaleCookieWriteOptions
  ) => Awaitable<void>;
  setCurrentLocale?: (locale: string) => Awaitable<void>;
  navigateToPathname?: (pathname: string) => Awaitable<void>;
  onLocaleSynced?: (locale: string) => Awaitable<void>;
  onPathLocaleResolution?: (resolution: PathLocaleResolution) => Awaitable<void>;
  acceptLanguageHeader?: string | null;
};
