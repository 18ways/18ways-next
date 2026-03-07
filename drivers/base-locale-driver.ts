import { LocaleDriver } from '@18ways/core/locale-engine';
import type { NextLocaleDriverContext } from './next-locale-driver-types';

export const BaseLocaleDriver: LocaleDriver<NextLocaleDriverContext> = {
  name: 'base-locale',
  getLocale: (context) => context.baseLocale,
  setLocale: () => {},
  handleListeners: () => {},
};
