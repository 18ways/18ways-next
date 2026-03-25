import { NextResponse, type NextRequest } from 'next/server';
import { extractLocalePrefix, normalizePathname } from '@18ways/core/i18n-shared';
import { findWaysDomainForLocale, resolveWaysDomains, stripPortFromHost } from './next-domains';
import type { WaysConfig } from './ways-config';

const WAYS_PROXY_MATCHER = [
  '/((?!_next|robots\\.txt$|llms\\.txt$|sitemap\\.xml$|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
];

export const createWaysProxy = (
  config: Pick<WaysConfig, 'router' | 'domains' | 'acceptedLocales' | 'baseLocale'>
) => {
  return async function waysProxy(request: NextRequest): Promise<NextResponse> {
    if (config.router !== 'app' || !config.domains?.length) {
      return NextResponse.next();
    }

    const pathname = normalizePathname(request.nextUrl.pathname);
    const acceptedLocales = config.acceptedLocales || [config.baseLocale];
    const pathInfo = extractLocalePrefix(pathname, acceptedLocales);
    if (!pathInfo.locale) {
      return NextResponse.next();
    }

    const resolvedDomains = resolveWaysDomains(config.baseLocale, config.domains);
    const targetDomain = findWaysDomainForLocale(pathInfo.locale, resolvedDomains);
    if (!targetDomain) {
      return NextResponse.next();
    }

    const currentHost = stripPortFromHost(
      request.headers.get('x-forwarded-host') || request.headers.get('host')
    );
    if (!currentHost || currentHost === targetDomain.domain) {
      return NextResponse.next();
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.host = targetDomain.domain;
    return NextResponse.redirect(redirectUrl, 308);
  };
};

let implicitProxyPromise: Promise<(request: NextRequest) => Promise<NextResponse>> | null = null;

const loadImplicitProxy = async () => {
  if (!implicitProxyPromise) {
    implicitProxyPromise = import('@18ways/next/internal-config')
      .then((module: { config?: WaysConfig; default?: WaysConfig }) => {
        const loadedConfig = module.config || module.default;
        if (!loadedConfig || typeof loadedConfig !== 'object') {
          throw new Error(
            'Missing 18ways config. Create 18ways.config.ts and wrap next.config.js with withWays(...).'
          );
        }

        return createWaysProxy(loadedConfig as WaysConfig);
      })
      .catch((error) => {
        implicitProxyPromise = null;
        throw error;
      });
  }

  return implicitProxyPromise;
};

export default async function waysProxy(request: NextRequest): Promise<NextResponse> {
  return (await loadImplicitProxy())(request);
}

export const config = {
  matcher: WAYS_PROXY_MATCHER,
};
