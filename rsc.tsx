import React from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Ways as ClientWays } from '@18ways/react';
import type { WaysProps, WaysRootProps } from '@18ways/react';
import {
  WAYS_LOCALE_COOKIE_NAME,
  WaysPathRoutingConfig,
  buildLocalizedPathname,
  extractLocalePrefix,
  isPathRoutingEnabled,
  isRtlLocale,
  joinOriginAndPathname,
  localeToOpenGraphLocale,
  normalizePathname,
} from '@18ways/core/i18n-shared';
import {
  _composeRequestInitDecorators,
  fetchAcceptedLocales,
  resolveOrigin,
} from '@18ways/core/common';
import { readPreferredLocalesFromAcceptLanguageHeader } from '@18ways/core/locale-drivers';
import { createNextLocaleEngine, type NextLocaleDriverContext } from './next-locale-drivers';
import { WAYS_LOCALIZED_PATHNAME_HEADER_NAME, WAYS_PATHNAME_HEADER_NAME } from './next-shared';
import { NextReactWays } from './next-react-client';
import { createNextRequestInitDecorator } from './next-request-init';

type LocaleResolutionProps = Partial<
  Pick<WaysRootProps, 'locale' | 'baseLocale' | '_apiUrl' | '_requestInitDecorator'>
> & {
  apiKey?: string;
  pathRouting?: WaysPathRoutingConfig;
};

const resolveLocaleFromRequest = async (
  props?: LocaleResolutionProps
): Promise<{ locale: string; supportedLocales: string[]; requestOrigin: string }> => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const acceptLanguageHeader = headerStore.get('accept-language');

  const fallbackLocale =
    props?.locale ||
    props?.baseLocale ||
    cookieStore.get(WAYS_LOCALE_COOKIE_NAME)?.value ||
    readPreferredLocalesFromAcceptLanguageHeader(acceptLanguageHeader)[0] ||
    'en-GB';

  const requestOrigin = resolveOrigin({
    host: headerStore.get('x-forwarded-host') || headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });

  const supportedLocales = await fetchAcceptedLocales(fallbackLocale, {
    apiUrl: props?._apiUrl,
    origin: requestOrigin,
    apiKey: props?.apiKey,
    _requestInitDecorator: _composeRequestInitDecorators(
      createNextRequestInitDecorator(),
      props?._requestInitDecorator
    ),
  });

  const engineContext: NextLocaleDriverContext = {
    pathname: normalizePathname(headerStore.get(WAYS_LOCALIZED_PATHNAME_HEADER_NAME) || '/'),
    baseLocale: fallbackLocale,
    acceptedLocales: supportedLocales,
    pathRouting: props?.pathRouting,
    readCookie: (cookieName) => cookieStore.get(cookieName)?.value,
    acceptLanguageHeader,
  };
  const localeEngine = createNextLocaleEngine<NextLocaleDriverContext>({
    baseLocale: fallbackLocale,
    acceptedLocales: supportedLocales,
  });
  const { locale } = await localeEngine.resolve(engineContext);

  return {
    locale,
    supportedLocales,
    requestOrigin,
  };
};

export const getWaysHtmlAttrs = async (
  props?: Partial<
    Pick<WaysRootProps, 'locale' | 'baseLocale' | 'apiKey' | '_apiUrl' | '_requestInitDecorator'>
  > & {
    pathRouting?: WaysPathRoutingConfig;
  }
): Promise<Record<string, string>> => {
  const { locale } = await resolveLocaleFromRequest(props);

  return {
    lang: locale,
    dir: isRtlLocale(locale) ? 'rtl' : 'ltr',
  };
};

const resolveRequestPaths = async (
  locale: string,
  pathRouting?: WaysPathRoutingConfig
): Promise<{ pathname: string; localizedPathname: string }> => {
  const headerStore = await headers();

  const pathname = normalizePathname(headerStore.get(WAYS_PATHNAME_HEADER_NAME) || '/');
  const localizedPathname = pathRouting
    ? normalizePathname(
        headerStore.get(WAYS_LOCALIZED_PATHNAME_HEADER_NAME) ||
          buildLocalizedPathname(pathname, locale)
      )
    : pathname;

  return {
    pathname,
    localizedPathname,
  };
};

export const generateWaysMetadata = async (
  props?: Partial<
    Pick<WaysRootProps, 'locale' | 'baseLocale' | 'apiKey' | '_apiUrl' | '_requestInitDecorator'>
  > & {
    origin?: string;
    pathRouting?: WaysPathRoutingConfig;
  }
): Promise<Record<string, any>> => {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const { locale, supportedLocales } = await resolveLocaleFromRequest(props);
  const fallbackLocale = props?.baseLocale || props?.locale || locale;
  const { pathname, localizedPathname } = await resolveRequestPaths(locale, props?.pathRouting);

  const origin = resolveOrigin({
    explicitOrigin: props?.origin,
    host: headerStore.get('x-forwarded-host') || headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });

  const pathRoutingEnabled = Boolean(
    props?.pathRouting && isPathRoutingEnabled(pathname, props.pathRouting)
  );

  const metadata: Record<string, any> = {
    metadataBase: new URL(origin),
    openGraph: {
      locale: localeToOpenGraphLocale(locale),
      alternateLocale: supportedLocales
        .filter((supportedLocale) => supportedLocale !== locale)
        .map(localeToOpenGraphLocale),
    },
    other: {
      '18ways_locale': locale,
      '18ways_locale_cookie': cookieStore.get(WAYS_LOCALE_COOKIE_NAME)?.value || '',
    },
  };

  if (pathRoutingEnabled) {
    const alternatesLanguages = Object.fromEntries(
      supportedLocales.map((supportedLocale) => [
        supportedLocale,
        joinOriginAndPathname(origin, buildLocalizedPathname(pathname, supportedLocale)),
      ])
    );

    alternatesLanguages['x-default'] = joinOriginAndPathname(
      origin,
      buildLocalizedPathname(pathname, fallbackLocale)
    );

    metadata.alternates = {
      canonical: joinOriginAndPathname(origin, localizedPathname),
      languages: alternatesLanguages,
    };
  } else {
    metadata.alternates = {
      canonical: joinOriginAndPathname(origin, pathname),
    };
  }

  return metadata;
};

type WaysRscProps = WaysProps & {
  pathRouting?: WaysPathRoutingConfig;
};

export async function Ways(props: WaysRscProps): Promise<React.JSX.Element> {
  if (!('apiKey' in props)) {
    return <ClientWays {...props} />;
  }

  const resolved = await resolveLocaleFromRequest(props);
  const locale = props.locale || resolved.locale;
  const { localizedPathname } = await resolveRequestPaths(locale, props.pathRouting);
  const knownLocales =
    Array.isArray(props.acceptedLocales) && props.acceptedLocales.length
      ? props.acceptedLocales
      : resolved.supportedLocales;
  const localePath = extractLocalePrefix(localizedPathname, knownLocales);

  if (
    localePath.locale &&
    localePath.locale !== locale &&
    props.pathRouting &&
    isPathRoutingEnabled(localePath.unlocalizedPathname, props.pathRouting)
  ) {
    redirect(buildLocalizedPathname(localePath.unlocalizedPathname, locale));
  }

  const {
    pathRouting: strippedPathRouting,
    _requestInitDecorator: strippedRequestInitDecorator,
    ...clientWaysProps
  } = props;
  void strippedPathRouting;
  void strippedRequestInitDecorator;

  return (
    <NextReactWays
      {...clientWaysProps}
      locale={locale}
      requestOrigin={resolved.requestOrigin}
      acceptedLocales={resolved.supportedLocales}
    />
  );
}

export type { WaysProps, WaysRootProps };
export { WAYS_LOCALE_COOKIE_NAME };
