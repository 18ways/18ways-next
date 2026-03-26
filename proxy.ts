import { NextResponse, type NextRequest } from 'next/server';
import {
  WAYS_LOCALE_COOKIE_NAME,
  extractLocalePrefix,
  findSupportedLocale,
  normalizePathname,
  recognizeLocale,
} from '@18ways/core/i18n-shared';
import { readPreferredLocalesFromAcceptLanguageHeader } from '@18ways/core/locale-drivers';
import {
  findWaysDomainForLocale,
  resolveDomainDefaultLocale,
  resolveWaysDomains,
  stripPortFromHost,
} from './next-domains';
import type { WaysConfig } from './ways-config';

const WAYS_PROXY_MATCHER = [
  '/((?!_next|robots\\.txt$|llms\\.txt$|sitemap\\.xml$|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
];

const resolveAcceptedLocale = (
  candidate: string | null | undefined,
  acceptedLocales: string[] | undefined
): string | null => {
  const recognizedCandidate = recognizeLocale(candidate);
  if (!recognizedCandidate) {
    return null;
  }

  if (!acceptedLocales?.length) {
    return recognizedCandidate;
  }

  return findSupportedLocale(recognizedCandidate, acceptedLocales);
};

const resolveProxyLocale = (
  request: NextRequest,
  config: Pick<WaysConfig, 'domains' | 'acceptedLocales' | 'baseLocale'>
): string => {
  const resolvedDomains = resolveWaysDomains(config.baseLocale, config.domains);
  const currentHost = stripPortFromHost(
    request.headers.get('x-forwarded-host') || request.headers.get('host')
  );
  const domainDefaultLocale = resolveDomainDefaultLocale(currentHost, resolvedDomains);
  if (domainDefaultLocale) {
    return domainDefaultLocale;
  }

  const cookieLocale = resolveAcceptedLocale(
    request.cookies.get(WAYS_LOCALE_COOKIE_NAME)?.value,
    config.acceptedLocales
  );
  if (cookieLocale) {
    return cookieLocale;
  }

  if (config.acceptedLocales?.length) {
    const preferredLocales = readPreferredLocalesFromAcceptLanguageHeader(
      request.headers.get('accept-language')
    );
    for (const preferredLocale of preferredLocales) {
      const matchedLocale = resolveAcceptedLocale(preferredLocale, config.acceptedLocales);
      if (matchedLocale) {
        return matchedLocale;
      }
    }
  }

  return config.baseLocale;
};

const getWaysProxyResponseForConfig = async (
  request: NextRequest,
  config: Pick<WaysConfig, 'router' | 'domains' | 'acceptedLocales' | 'baseLocale'>
): Promise<NextResponse | null> => {
  if (config.router !== 'app') {
    return null;
  }

  const pathname = normalizePathname(request.nextUrl.pathname);
  const acceptedLocales = config.acceptedLocales || [config.baseLocale];
  const resolvedDomains = resolveWaysDomains(config.baseLocale, config.domains);
  const currentHost = stripPortFromHost(
    request.headers.get('x-forwarded-host') || request.headers.get('host')
  );

  if (pathname === '/') {
    const locale = resolveProxyLocale(request, config);
    const redirectUrl = request.nextUrl.clone();
    const targetDomain = findWaysDomainForLocale(locale, resolvedDomains);
    if (targetDomain && currentHost && currentHost !== targetDomain.domain) {
      redirectUrl.host = targetDomain.domain;
    }
    redirectUrl.pathname = `/${locale}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (!config.domains?.length) {
    return null;
  }

  const pathInfo = extractLocalePrefix(pathname, acceptedLocales);
  if (!pathInfo.locale) {
    return null;
  }

  const targetDomain = findWaysDomainForLocale(pathInfo.locale, resolvedDomains);
  if (!targetDomain) {
    return null;
  }

  if (!currentHost || currentHost === targetDomain.domain) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.host = targetDomain.domain;
  return NextResponse.redirect(redirectUrl, 308);
};

export async function getWaysProxyResponse(request: NextRequest): Promise<NextResponse | null>;
export async function getWaysProxyResponse(
  request: NextRequest,
  config: Pick<WaysConfig, 'router' | 'domains' | 'acceptedLocales' | 'baseLocale'>
): Promise<NextResponse | null>;
export async function getWaysProxyResponse(
  request: NextRequest,
  config?: Pick<WaysConfig, 'router' | 'domains' | 'acceptedLocales' | 'baseLocale'>
): Promise<NextResponse | null> {
  if (config) {
    return getWaysProxyResponseForConfig(request, config);
  }

  return (await loadImplicitProxy())(request);
}

export const createWaysProxy = (
  config: Pick<WaysConfig, 'router' | 'domains' | 'acceptedLocales' | 'baseLocale'>
) => {
  return async function waysProxy(request: NextRequest): Promise<NextResponse> {
    return (await getWaysProxyResponseForConfig(request, config)) || NextResponse.next();
  };
};

let implicitProxyPromise: Promise<(request: NextRequest) => Promise<NextResponse | null>> | null =
  null;

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

        return (request: NextRequest) =>
          getWaysProxyResponseForConfig(request, loadedConfig as WaysConfig);
      })
      .catch((error) => {
        implicitProxyPromise = null;
        throw error;
      });
  }

  return implicitProxyPromise;
};

export default async function waysProxy(request: NextRequest): Promise<NextResponse> {
  return (await getWaysProxyResponse(request)) || NextResponse.next();
}

export const config = {
  matcher: WAYS_PROXY_MATCHER,
};
