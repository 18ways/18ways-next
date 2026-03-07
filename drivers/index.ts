import type { LocaleDriver } from '@18ways/core/locale-engine';
import { BaseLocaleDriver } from './base-locale-driver';
import { BrowserPreferenceDriver } from './browser-preference-driver';
import {
  type NextLocaleCookieWriteOptions,
  type NextLocaleDriverContext,
  type PathLocaleResolution,
} from './next-locale-driver-types';
import { PathLocaleDriver } from './path-locale-driver';
import { SessionCookieDriver } from './session-cookie-driver';

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
  return [
    SessionCookieDriver as LocaleDriver<TContext>,
    PathLocaleDriver as LocaleDriver<TContext>,
    BrowserPreferenceDriver as LocaleDriver<TContext>,
    BaseLocaleDriver as LocaleDriver<TContext>,
  ];
};
