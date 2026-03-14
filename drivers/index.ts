import {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  SessionCookieDriver,
} from '@18ways/core/locale-drivers';
import {
  PathLocaleDriver,
  createPathLocaleDrivers,
  type PathLocaleDriverContext,
  type PathLocaleResolution as CorePathLocaleResolution,
} from '@18ways/core/path-locale-driver';
import { type NextLocaleCookieWriteOptions } from './next-locale-driver-types';

export type NextLocaleDriverContext = PathLocaleDriverContext;
export type PathLocaleResolution = CorePathLocaleResolution;

export {
  BaseLocaleDriver,
  BrowserPreferenceDriver,
  PathLocaleDriver,
  SessionCookieDriver,
  type NextLocaleCookieWriteOptions,
};

export const createNextLocaleDrivers = <TContext extends NextLocaleDriverContext>() => {
  return createPathLocaleDrivers<TContext>();
};
