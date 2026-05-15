import { NextResponse, type NextRequest } from 'next/server';
import {
  fetchAcceptedLocales,
  init,
  resolveAcceptedLocales,
  resolveOrigin,
} from '@18ways/core/common';
import {
  WAYS_LOCALE_COOKIE_NAME,
  buildLocalizedPathname,
  extractLocalePrefix,
  findSupportedLocale,
  isPathRoutingEnabled,
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

type WaysProxyConfig = Pick<
  WaysConfig,
  | 'router'
  | 'domains'
  | 'acceptedLocales'
  | 'baseLocale'
  | 'apiKey'
  | '_apiUrl'
  | '_requestInitDecorator'
  | 'requestOrigin'
  | 'pathRouting'
  | 'routeManifest'
>;

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
  config: Pick<WaysProxyConfig, 'domains' | 'baseLocale'>,
  acceptedLocales: string[]
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
    acceptedLocales
  );
  if (cookieLocale) {
    return cookieLocale;
  }

  if (acceptedLocales.length) {
    const preferredLocales = readPreferredLocalesFromAcceptLanguageHeader(
      request.headers.get('accept-language')
    );
    for (const preferredLocale of preferredLocales) {
      const matchedLocale = resolveAcceptedLocale(preferredLocale, acceptedLocales);
      if (matchedLocale) {
        return matchedLocale;
      }
    }
  }

  return config.baseLocale;
};

const resolveProxyAcceptedLocales = async (
  config: Pick<WaysProxyConfig, 'acceptedLocales' | 'baseLocale' | 'apiKey'>,
  requestOrigin?: string
): Promise<string[]> => {
  if (Array.isArray(config.acceptedLocales)) {
    return resolveAcceptedLocales(config.baseLocale, config.acceptedLocales);
  }

  return resolveAcceptedLocales(
    config.baseLocale,
    config.apiKey
      ? await fetchAcceptedLocales(config.baseLocale, { origin: requestOrigin })
      : [config.baseLocale]
  );
};

const appendVaryHeader = (response: NextResponse, headerName: string) => {
  const varyValues = (response.headers.get('vary') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (varyValues.some((value) => value.toLowerCase() === headerName.toLowerCase())) {
    return;
  }

  response.headers.set('vary', [...varyValues, headerName].join(', '));
};

const isDynamicRouteSegment = (segment: string): boolean => {
  return /^\[[^.[\]/]+\]$/.test(segment);
};

const isCatchAllRouteSegment = (segment: string): boolean => {
  return /^\[\.\.\.[^[\]/]+\]$/.test(segment);
};

const isOptionalCatchAllRouteSegment = (segment: string): boolean => {
  return /^\[\[\.\.\.[^[\]/]+\]\]$/.test(segment);
};

const isLocaleRegionSegment = (segment: string): boolean => /^[a-z]{2,3}-[a-z]{2}$/i.test(segment);

const routeManifestPatternMatchesPathname = (pattern: string, pathname: string): boolean => {
  const patternSegments = normalizePathname(pattern).split('/').filter(Boolean);
  const pathnameSegments = normalizePathname(pathname).split('/').filter(Boolean);

  if (!patternSegments.length) {
    return pathnameSegments.length === 0;
  }

  let pathnameIndex = 0;

  for (let patternIndex = 0; patternIndex < patternSegments.length; patternIndex += 1) {
    const patternSegment = patternSegments[patternIndex];

    if (isOptionalCatchAllRouteSegment(patternSegment)) {
      return patternIndex === patternSegments.length - 1;
    }

    if (isCatchAllRouteSegment(patternSegment)) {
      return patternIndex === patternSegments.length - 1 && pathnameIndex < pathnameSegments.length;
    }

    if (pathnameIndex >= pathnameSegments.length) {
      return false;
    }

    if (
      !isDynamicRouteSegment(patternSegment) &&
      patternSegment !== pathnameSegments[pathnameIndex]
    ) {
      return false;
    }

    pathnameIndex += 1;
  }

  return pathnameIndex === pathnameSegments.length;
};

const isLocalizedRouteManifestPathname = (
  pathname: string,
  routeManifest: WaysProxyConfig['routeManifest']
): boolean => {
  return Boolean(
    routeManifest?.localized.some((pattern) =>
      routeManifestPatternMatchesPathname(pattern, pathname)
    )
  );
};

const shouldRedirectToLocalizedPathname = (
  pathname: string,
  config: Pick<WaysProxyConfig, 'pathRouting' | 'routeManifest'>
): boolean => {
  const normalizedPathname = normalizePathname(pathname);

  if (!isPathRoutingEnabled(normalizedPathname, config.pathRouting)) {
    return false;
  }

  if (normalizedPathname === '/') {
    return true;
  }

  return isLocalizedRouteManifestPathname(normalizedPathname, config.routeManifest);
};

const createLocalizedPathnameRedirectResponse = (
  request: NextRequest,
  config: Pick<WaysProxyConfig, 'domains' | 'baseLocale'>,
  locale: string,
  currentHost: string | null
): NextResponse => {
  const redirectUrl = request.nextUrl.clone();
  const targetDomain = findWaysDomainForLocale(
    locale,
    resolveWaysDomains(config.baseLocale, config.domains)
  );
  if (targetDomain && currentHost && currentHost !== targetDomain.domain) {
    redirectUrl.host = targetDomain.domain;
  }
  redirectUrl.pathname =
    normalizePathname(request.nextUrl.pathname) === '/'
      ? `/${locale}`
      : `/${locale}${normalizePathname(request.nextUrl.pathname)}`;
  const response = NextResponse.redirect(redirectUrl, 307);
  appendVaryHeader(response, 'Accept-Language');
  appendVaryHeader(response, 'Cookie');
  return response;
};

const createCanonicalLocalePrefixRedirectResponse = (
  request: NextRequest,
  config: Pick<WaysProxyConfig, 'domains' | 'baseLocale'>,
  locale: string,
  unlocalizedPathname: string,
  currentHost: string | null
): NextResponse => {
  const redirectUrl = request.nextUrl.clone();
  const targetDomain = findWaysDomainForLocale(
    locale,
    resolveWaysDomains(config.baseLocale, config.domains)
  );
  if (targetDomain && currentHost && currentHost !== targetDomain.domain) {
    redirectUrl.host = targetDomain.domain;
  }
  redirectUrl.pathname = buildLocalizedPathname(unlocalizedPathname, locale);
  return NextResponse.redirect(redirectUrl, 307);
};

const getWaysProxyResponseForConfig = async (
  request: NextRequest,
  config: WaysProxyConfig
): Promise<NextResponse | null> => {
  const requestOrigin = resolveOrigin({
    explicitOrigin: config.requestOrigin,
    host: request.headers.get('x-forwarded-host') || request.headers.get('host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
  });

  if (config.apiKey) {
    init({
      key: config.apiKey,
      apiUrl: config._apiUrl,
      _requestInitDecorator: config._requestInitDecorator,
    });
  }

  if (config.router !== 'app') {
    return null;
  }

  const pathname = normalizePathname(request.nextUrl.pathname);
  const resolvedDomains = resolveWaysDomains(config.baseLocale, config.domains);
  const currentHost = stripPortFromHost(
    request.headers.get('x-forwarded-host') || request.headers.get('host')
  );
  let acceptedLocalesPromise: Promise<string[]> | null = null;
  const getAcceptedLocales = () => {
    acceptedLocalesPromise ||= resolveProxyAcceptedLocales(config, requestOrigin);
    return acceptedLocalesPromise;
  };

  const firstSegment = pathname.split('/').filter(Boolean)[0];
  const recognizedFirstSegment = recognizeLocale(firstSegment);
  if (
    firstSegment &&
    isLocaleRegionSegment(firstSegment) &&
    recognizedFirstSegment &&
    (firstSegment !== recognizedFirstSegment || Array.isArray(config.acceptedLocales))
  ) {
    const acceptedLocales = await getAcceptedLocales();
    const pathInfo = extractLocalePrefix(pathname, acceptedLocales);
    if (
      pathInfo.locale &&
      pathInfo.locale !== firstSegment &&
      isPathRoutingEnabled(pathInfo.unlocalizedPathname, config.pathRouting)
    ) {
      return createCanonicalLocalePrefixRedirectResponse(
        request,
        config,
        pathInfo.locale,
        pathInfo.unlocalizedPathname,
        currentHost
      );
    }
  }

  if (shouldRedirectToLocalizedPathname(pathname, config)) {
    const acceptedLocales = await getAcceptedLocales();
    if (extractLocalePrefix(pathname, acceptedLocales).locale) {
      return null;
    }

    const locale = resolveProxyLocale(request, config, acceptedLocales);
    return createLocalizedPathnameRedirectResponse(request, config, locale, currentHost);
  }

  if (!config.domains?.length) {
    return null;
  }

  const acceptedLocales =
    Array.isArray(config.acceptedLocales) && config.acceptedLocales.length > 0
      ? resolveAcceptedLocales(config.baseLocale, config.acceptedLocales)
      : [config.baseLocale];
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
  config: WaysProxyConfig
): Promise<NextResponse | null>;
export async function getWaysProxyResponse(
  request: NextRequest,
  config?: WaysProxyConfig
): Promise<NextResponse | null> {
  if (config) {
    return getWaysProxyResponseForConfig(request, config);
  }

  return (await loadImplicitProxy())(request);
}

export const createWaysProxy = (config: WaysProxyConfig) => {
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
