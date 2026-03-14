import { createPathLocaleEngine } from '@18ways/core/path-locale-driver';
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

export const createNextLocaleEngine = <TContext extends NextLocaleDriverContext>(options: {
  baseLocale: string;
  acceptedLocales?: string[];
}) => {
  return createPathLocaleEngine<TContext>(options);
};
