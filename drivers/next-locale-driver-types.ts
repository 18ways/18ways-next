import type { LocaleCookieWriteOptions } from '@18ways/core/locale-drivers';
import type {
  PathLocaleDriverContext,
  PathLocaleResolution as CorePathLocaleResolution,
} from '@18ways/core/path-locale-driver';

export type NextLocaleCookieWriteOptions = LocaleCookieWriteOptions;
export type PathLocaleResolution = CorePathLocaleResolution;
export type NextLocaleDriverContext = PathLocaleDriverContext;
