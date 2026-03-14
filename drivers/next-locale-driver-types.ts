import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';
import type {
  Awaitable,
  LocaleCookieWriteOptions,
  LocaleDriverContext,
} from '@18ways/core/locale-drivers';

export type NextLocaleCookieWriteOptions = LocaleCookieWriteOptions;

export type PathLocaleResolution = {
  unlocalizedPathname: string;
  localizedPathname: string;
  rewritePathname?: string;
  redirectPathname?: string;
};

export type NextLocaleDriverContext = LocaleDriverContext & {
  pathname: string;
  pathRouting?: WaysPathRoutingConfig;
  navigateToPathname?: (pathname: string) => Awaitable<void>;
  onPathLocaleResolution?: (resolution: PathLocaleResolution) => Awaitable<void>;
};
