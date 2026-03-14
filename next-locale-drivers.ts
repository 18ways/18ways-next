import type { LocaleDriver } from '@18ways/core/locale-engine';
import { createLocaleEngine } from '@18ways/core/locale-drivers';
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
  return createLocaleEngine<TContext>({
    baseLocale: options.baseLocale,
    acceptedLocales: options.acceptedLocales,
    extraDrivers: [PathLocaleDriver as LocaleDriver<TContext>],
  });
};
