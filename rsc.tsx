import React from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { Ways as ClientWays } from '@18ways/react';
import type { WaysProps, WaysRootProps } from '@18ways/react';
import {
  WAYS_LOCALE_COOKIE_NAME,
  WaysPathRoutingConfig,
  buildLocalizedPathname,
  extractLocalePrefix,
  findSupportedLocale,
  isPathRoutingEnabled,
  isRtlLocale,
  joinOriginAndPathname,
  localeToOpenGraphLocale,
  normalizePathname,
} from '@18ways/core/i18n-shared';
import {
  _composeRequestInitDecorators,
  fetchAcceptedLocales,
  resolveAcceptedLocales,
  resolveOrigin,
} from '@18ways/core/common';
import { readPreferredLocalesFromAcceptLanguageHeader } from '@18ways/core/locale-drivers';
import { createNextLocaleEngine, type NextLocaleDriverContext } from './next-locale-drivers';
import {
  WAYS_LOCALIZED_PATHNAME_HEADER_NAME,
  WAYS_PATHNAME_HEADER_NAME,
  WAYS_PERSIST_LOCALE_COOKIE_HEADER_NAME,
} from './next-shared';
import { NextReactWays } from './next-react-client';
import { createNextRequestInitDecorator } from './next-request-init';
import type { WaysPersistLocaleCookiePolicy } from './ways-config';
import {
  buildLocaleOrigin,
  resolveDomainDefaultLocale,
  resolveWaysDomains,
  type WaysDomainConfig,
} from './next-domains';
import {
  resolveRouteLocaleFromParams,
  type WaysMaybePromise,
  type WaysRouteParams,
} from './next-route-params';
import type { WaysRouteManifest, WaysRouterMode } from './ways-config';

const DEFAULT_SEGMENT_PATH_ROUTING: WaysPathRoutingConfig = {
  exclude: [],
};

const resolveRoutePathRouting = (
  pathRouting: WaysPathRoutingConfig | undefined,
  hasRouteParams: boolean | undefined
): WaysPathRoutingConfig | undefined => {
  if (!hasRouteParams) {
    return pathRouting;
  }

  return pathRouting || DEFAULT_SEGMENT_PATH_ROUTING;
};

type LocaleResolutionProps = Partial<
  Pick<
    WaysRootProps,
    'locale' | 'baseLocale' | 'acceptedLocales' | '_apiUrl' | '_requestInitDecorator'
  >
> & {
  apiKey?: string;
  pathRouting?: WaysPathRoutingConfig;
  domains?: WaysDomainConfig[];
  localeParamName?: string;
  params?: WaysMaybePromise<WaysRouteParams>;
  pathname?: string;
  origin?: string;
};

const resolveRequestAcceptedLocales = async (
  fallbackLocale: string,
  requestOrigin: string,
  props?: LocaleResolutionProps
): Promise<string[]> => {
  const acceptedLocalesBaseLocale = props?.baseLocale || fallbackLocale;

  if (Array.isArray(props?.acceptedLocales)) {
    return resolveAcceptedLocales(acceptedLocalesBaseLocale, props.acceptedLocales);
  }

  return resolveAcceptedLocales(
    acceptedLocalesBaseLocale,
    await fetchAcceptedLocales(acceptedLocalesBaseLocale, {
      apiUrl: props?._apiUrl,
      origin: requestOrigin,
      apiKey: props?.apiKey,
      _requestInitDecorator: _composeRequestInitDecorators(
        createNextRequestInitDecorator(),
        props?._requestInitDecorator
      ),
    })
  );
};

const resolveLocaleFromRequest = async (
  props?: LocaleResolutionProps
): Promise<{
  locale: string;
  acceptedLocales: string[];
  requestOrigin: string;
  routeLocale?: string;
  invalidRouteLocale?: string;
}> => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const acceptLanguageHeader = headerStore.get('accept-language');
  const routeLocale = await resolveRouteLocaleFromParams(props?.params, props?.localeParamName);
  const resolvedDomains = resolveWaysDomains(props?.baseLocale || 'en-GB', props?.domains);
  const domainDefaultLocale = resolveDomainDefaultLocale(
    headerStore.get('x-forwarded-host') || headerStore.get('host'),
    resolvedDomains
  );

  const fallbackLocale =
    props?.locale ||
    routeLocale ||
    domainDefaultLocale ||
    props?.baseLocale ||
    cookieStore.get(WAYS_LOCALE_COOKIE_NAME)?.value ||
    readPreferredLocalesFromAcceptLanguageHeader(acceptLanguageHeader)[0] ||
    'en-GB';

  const requestOrigin = resolveOrigin({
    explicitOrigin: props?.origin,
    host: headerStore.get('x-forwarded-host') || headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });
  const acceptedLocales = await resolveRequestAcceptedLocales(fallbackLocale, requestOrigin, props);

  if (routeLocale) {
    const matchedRouteLocale = findSupportedLocale(routeLocale, acceptedLocales);
    if (!matchedRouteLocale) {
      return {
        locale: fallbackLocale,
        acceptedLocales,
        requestOrigin,
        routeLocale,
        invalidRouteLocale: routeLocale,
      };
    }

    return {
      locale: matchedRouteLocale,
      acceptedLocales,
      requestOrigin,
      routeLocale: matchedRouteLocale,
    };
  }

  const engineContext: NextLocaleDriverContext = {
    pathname: normalizePathname(headerStore.get(WAYS_LOCALIZED_PATHNAME_HEADER_NAME) || '/'),
    baseLocale: fallbackLocale,
    acceptedLocales,
    pathRouting: props?.pathRouting,
    readCookie: (cookieName) => cookieStore.get(cookieName)?.value,
    acceptLanguageHeader,
  };
  const localeEngine = createNextLocaleEngine<NextLocaleDriverContext>({
    baseLocale: fallbackLocale,
    acceptedLocales,
  });
  const { locale } = await localeEngine.resolve(engineContext);

  return {
    locale,
    acceptedLocales,
    requestOrigin,
  };
};

export const getWaysLocale = async (props?: LocaleResolutionProps): Promise<string> => {
  const { locale, invalidRouteLocale } = await resolveLocaleFromRequest(props);
  if (invalidRouteLocale) {
    notFound();
  }

  return locale;
};

export const getWaysHtmlAttrs = async (
  props?: Partial<
    Pick<
      WaysRootProps,
      'locale' | 'baseLocale' | 'acceptedLocales' | 'apiKey' | '_apiUrl' | '_requestInitDecorator'
    >
  > & {
    pathRouting?: WaysPathRoutingConfig;
    domains?: WaysDomainConfig[];
    localeParamName?: string;
    params?: WaysMaybePromise<WaysRouteParams>;
    origin?: string;
  }
): Promise<Record<string, string>> => {
  const locale = await getWaysLocale(props);

  return {
    lang: locale,
    dir: isRtlLocale(locale) ? 'rtl' : 'ltr',
  };
};

const resolveRequestPaths = async (
  locale: string,
  pathRouting?: WaysPathRoutingConfig,
  pathnameOverride?: string
): Promise<{ pathname: string; localizedPathname: string }> => {
  const headerStore = await headers();

  const pathname = normalizePathname(
    pathnameOverride || headerStore.get(WAYS_PATHNAME_HEADER_NAME) || '/'
  );
  const localizedPathname = pathRouting
    ? normalizePathname(
        pathnameOverride
          ? buildLocalizedPathname(pathname, locale)
          : headerStore.get(WAYS_LOCALIZED_PATHNAME_HEADER_NAME) ||
              buildLocalizedPathname(pathname, locale)
      )
    : pathname;

  return {
    pathname,
    localizedPathname,
  };
};

const buildLocaleUrl = (
  requestOrigin: string,
  pathname: string,
  locale: string,
  domains?: WaysDomainConfig[]
): string => {
  return joinOriginAndPathname(
    buildLocaleOrigin(requestOrigin, locale, resolveWaysDomains(locale, domains)),
    buildLocalizedPathname(pathname, locale)
  );
};

type WaysMetadataOptions = Partial<
  Pick<
    WaysRootProps,
    'locale' | 'baseLocale' | 'acceptedLocales' | 'apiKey' | '_apiUrl' | '_requestInitDecorator'
  >
> & {
  origin?: string;
  pathRouting?: WaysPathRoutingConfig;
  domains?: WaysDomainConfig[];
  localeParamName?: string;
  params?: WaysMaybePromise<WaysRouteParams>;
  pathname?: string;
};

type WaysAlternates = {
  canonical: string;
  languages?: Record<string, string>;
};

const buildWaysAlternates = async (props?: WaysMetadataOptions): Promise<WaysAlternates> => {
  const headerStore = await headers();
  const { locale, acceptedLocales, invalidRouteLocale } = await resolveLocaleFromRequest(props);

  if (invalidRouteLocale) {
    notFound();
  }

  const fallbackLocale = props?.baseLocale || props?.locale || locale;
  const routePathRouting = resolveRoutePathRouting(props?.pathRouting, Boolean(props?.params));
  const { pathname } = await resolveRequestPaths(locale, routePathRouting, props?.pathname);
  const origin = resolveOrigin({
    explicitOrigin: props?.origin,
    host: headerStore.get('x-forwarded-host') || headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });

  if (!routePathRouting || !isPathRoutingEnabled(pathname, routePathRouting)) {
    return {
      canonical: joinOriginAndPathname(origin, pathname),
    };
  }

  const languages = Object.fromEntries(
    acceptedLocales.map((supportedLocale) => [
      supportedLocale,
      buildLocaleUrl(origin, pathname, supportedLocale, props?.domains),
    ])
  );

  languages['x-default'] = buildLocaleUrl(origin, pathname, fallbackLocale, props?.domains);

  return {
    canonical: buildLocaleUrl(origin, pathname, locale, props?.domains),
    languages,
  };
};

export const generateWaysMetadata = async (
  props?: WaysMetadataOptions
): Promise<Record<string, any>> => {
  const cookieStore = await cookies();

  const { locale, acceptedLocales, invalidRouteLocale } = await resolveLocaleFromRequest(props);
  if (invalidRouteLocale) {
    notFound();
  }
  const alternates = await buildWaysAlternates(props);

  const metadata: Record<string, any> = {
    metadataBase: new URL(
      typeof alternates.canonical === 'string'
        ? new URL(alternates.canonical).origin
        : resolveOrigin({ explicitOrigin: props?.origin })
    ),
    openGraph: {
      locale: localeToOpenGraphLocale(locale),
      alternateLocale: acceptedLocales
        .filter((supportedLocale) => supportedLocale !== locale)
        .map(localeToOpenGraphLocale),
    },
    other: {
      '18ways_locale': locale,
      '18ways_locale_cookie': cookieStore.get(WAYS_LOCALE_COOKIE_NAME)?.value || '',
    },
    alternates,
  };

  return metadata;
};

type WaysRscProps = WaysProps & {
  router?: WaysRouterMode;
  pathRouting?: WaysPathRoutingConfig;
  _persistLocaleCookiePolicy?: WaysPersistLocaleCookiePolicy;
  domains?: WaysDomainConfig[];
  localeParamName?: string;
  routeManifest?: WaysRouteManifest;
  params?: WaysMaybePromise<WaysRouteParams>;
  pathname?: string;
};

const parsePersistLocaleCookieHeader = (rawValue: string | null): boolean | undefined => {
  if (rawValue === 'true') {
    return true;
  }

  if (rawValue === 'false') {
    return false;
  }

  return undefined;
};

const createRequestFromHeaders = async (url: string): Promise<NextRequest> => {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const requestHeaders = new Headers(headerStore);

  if (!requestHeaders.has('cookie')) {
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    if (cookieHeader) {
      requestHeaders.set('cookie', cookieHeader);
    }
  }

  return new NextRequest(url, {
    headers: requestHeaders,
  });
};

export async function Ways(props: WaysRscProps): Promise<React.JSX.Element> {
  if (!('apiKey' in props)) {
    const {
      router: strippedRouter,
      pathRouting: strippedPathRouting,
      _persistLocaleCookiePolicy: strippedPersistLocaleCookiePolicy,
      domains: strippedDomains,
      localeParamName: strippedLocaleParamName,
      routeManifest: strippedRouteManifest,
      params: strippedParams,
      pathname: strippedPathname,
      ...clientWaysProps
    } = props;
    void strippedRouter;
    void strippedPathRouting;
    void strippedPersistLocaleCookiePolicy;
    void strippedDomains;
    void strippedLocaleParamName;
    void strippedRouteManifest;
    void strippedParams;
    void strippedPathname;

    return <ClientWays {...clientWaysProps} />;
  }

  const resolved = await resolveLocaleFromRequest(props);
  if (resolved.invalidRouteLocale) {
    notFound();
  }
  const headerStore = await headers();
  const locale = props.locale || resolved.locale;
  const routePathRouting = resolveRoutePathRouting(props.pathRouting, Boolean(props.params));
  const { pathname, localizedPathname } = await resolveRequestPaths(
    locale,
    routePathRouting,
    props.pathname
  );
  const localePath = extractLocalePrefix(localizedPathname, resolved.acceptedLocales);

  if (
    localePath.locale &&
    localePath.locale !== locale &&
    routePathRouting &&
    isPathRoutingEnabled(localePath.unlocalizedPathname, routePathRouting)
  ) {
    redirect(buildLocalizedPathname(localePath.unlocalizedPathname, locale));
  }

  const requestUrl = joinOriginAndPathname(
    resolved.requestOrigin,
    routePathRouting ? localizedPathname : pathname
  );
  const requestPersistLocaleCookie =
    parsePersistLocaleCookieHeader(headerStore.get(WAYS_PERSIST_LOCALE_COOKIE_HEADER_NAME)) ??
    (typeof props._persistLocaleCookiePolicy === 'function'
      ? props._persistLocaleCookiePolicy(await createRequestFromHeaders(requestUrl))
      : props.persistLocaleCookie);

  const {
    router: strippedRouter,
    pathRouting: strippedPathRouting,
    _persistLocaleCookiePolicy: strippedPersistLocaleCookiePolicy,
    _requestInitDecorator: strippedRequestInitDecorator,
    localeParamName: strippedLocaleParamName,
    routeManifest: strippedRouteManifest,
    params: strippedParams,
    pathname: strippedPathname,
    ...clientWaysProps
  } = props;
  void strippedRouter;
  void strippedPathRouting;
  void strippedPersistLocaleCookiePolicy;
  void strippedRequestInitDecorator;
  void strippedLocaleParamName;
  void strippedRouteManifest;
  void strippedParams;
  void strippedPathname;

  return (
    <NextReactWays
      {...clientWaysProps}
      locale={locale}
      requestOrigin={resolved.requestOrigin}
      acceptedLocales={resolved.acceptedLocales}
      router={props.router}
      pathRouting={routePathRouting}
      syncPathRouting={!props.params}
      domains={props.domains}
      localeParamName={props.localeParamName}
      routeManifest={props.routeManifest}
      persistLocaleCookie={requestPersistLocaleCookie}
    />
  );
}

export type { WaysProps, WaysRootProps };
export { WAYS_LOCALE_COOKIE_NAME };
