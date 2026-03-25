import type { NextRequest } from 'next/server';
import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';
import type { WaysRootProps } from '@18ways/react';
import type { WaysDomainConfig } from './next-domains';

export type WaysRouterMode = 'app' | 'path' | 'none';
export type WaysLegacyRouterMode = WaysRouterMode | 'pages';

export type WaysPersistLocaleCookiePolicy = boolean | ((request: NextRequest) => boolean);

export type WaysRouteManifest = {
  localized: string[];
  unlocalized: string[];
  ambiguous: string[];
};

export type WaysConfig = Pick<
  WaysRootProps,
  | 'apiKey'
  | 'locale'
  | 'acceptedLocales'
  | 'cacheTtl'
  | 'fetcher'
  | 'messageFormatter'
  | 'serverInitialTranslationTimeoutMs'
  | '_apiUrl'
  | '_requestInitDecorator'
> & {
  baseLocale: string;
  router?: WaysLegacyRouterMode;
  domains?: WaysDomainConfig[];
  localeParamName?: string;
  persistLocaleCookie?: WaysPersistLocaleCookiePolicy;
  requestOrigin?: string;
  pathRouting?: WaysPathRoutingConfig;
  routeManifest?: WaysRouteManifest;
};

export type WaysPublicConfig = Omit<
  WaysConfig,
  'persistLocaleCookie' | 'fetcher' | '_requestInitDecorator' | 'requestOrigin'
> & {
  baseLocale: string;
  router: WaysRouterMode;
  localeParamName: string;
  pathRouting?: WaysPathRoutingConfig;
  routeManifest?: WaysRouteManifest;
  persistLocaleCookie?: boolean;
};
