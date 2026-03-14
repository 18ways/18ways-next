import type { LocaleDriver } from '@18ways/core/locale-engine';
import {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  SessionCookieDriver,
  createLocaleDrivers,
} from '@18ways/core/locale-drivers';
import {
  type NextLocaleCookieWriteOptions,
  type NextLocaleDriverContext,
  type PathLocaleResolution,
} from './next-locale-driver-types';
import { PathLocaleDriver } from './path-locale-driver';

export {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  PathLocaleDriver,
  SessionCookieDriver,
  type NextLocaleCookieWriteOptions,
  type NextLocaleDriverContext,
  type PathLocaleResolution,
};

export const createNextLocaleDrivers = <
  TContext extends NextLocaleDriverContext,
>(): LocaleDriver<TContext>[] => {
  return createLocaleDrivers([PathLocaleDriver as LocaleDriver<TContext>]);
};
