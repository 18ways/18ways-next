import {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  SessionCookieDriver,
  type LocaleCookieWriteOptions,
} from '@18ways/core/locale-drivers';
import {
  PathLocaleDriver,
  createPathLocaleDrivers,
  createPathLocaleEngine,
  type PathLocaleDriverContext,
  type PathLocaleResolution,
} from '@18ways/core/path-locale-driver';

export type NextLocaleCookieWriteOptions = LocaleCookieWriteOptions;
export type NextLocaleDriverContext = PathLocaleDriverContext;

export {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  PathLocaleDriver,
  SessionCookieDriver,
  type PathLocaleResolution,
};

export const createNextLocaleDrivers = <TContext extends NextLocaleDriverContext>() => {
  return createPathLocaleDrivers<TContext>();
};

export const createNextLocaleEngine = <TContext extends NextLocaleDriverContext>(options: {
  baseLocale: string;
  acceptedLocales?: string[];
}) => {
  return createPathLocaleEngine<TContext>(options);
};
