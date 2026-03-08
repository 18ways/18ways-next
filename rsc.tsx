import React from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Ways as ClientWays } from '@18ways/react';
import type { WaysProps, WaysRootProps } from '@18ways/react';
import {
  DEFAULT_WAYS_PATH_ROUTING,
  WAYS_LOCALE_COOKIE_NAME,
  WAYS_SESSION_LOCALE_COOKIE_NAME,
  WAYS_PATHNAME_HEADER_NAME,
  WAYS_LOCALIZED_PATHNAME_HEADER_NAME,
  buildLocalizedPathname,
  extractLocalePrefix,
  fetchAcceptedLocales,
  isPathRoutingEnabled,
  isRtlLocale,
  joinOriginAndPathname,
  localeToOpenGraphLocale,
  normalizePathname,
  resolveOrigin,
} from '@18ways/core/i18n-shared';
import { createNextLocaleEngine, type NextLocaleDriverContext } from './next-locale-drivers';

type LocaleResolutionProps = Partial<Pick<WaysRootProps, 'locale' | 'baseLocale'>> & {
  apiKey?: string;
};

const resolveLocaleFromRequest = async (
  props?: LocaleResolutionProps
): Promise<{ locale: string; supportedLocales: string[]; requestOrigin: string }> => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const fallbackLocale =
    props?.locale ||
    props?.baseLocale ||
    cookieStore.get(WAYS_SESSION_LOCALE_COOKIE_NAME)?.value ||
    cookieStore.get(WAYS_LOCALE_COOKIE_NAME)?.value ||
    headerStore.get('accept-language')?.split(',')[0] ||
    'en-GB';

  const requestOrigin = resolveOrigin({
    host: headerStore.get('x-forwarded-host') || headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });

  const supportedLocales = await fetchAcceptedLocales(fallbackLocale, {
    origin: requestOrigin,
    apiKey: props?.apiKey,
  });

  const engineContext: NextLocaleDriverContext = {
    pathname: normalizePathname(headerStore.get(WAYS_LOCALIZED_PATHNAME_HEADER_NAME) || '/'),
    baseLocale: fallbackLocale,
    acceptedLocales: supportedLocales,
    pathRouting: DEFAULT_WAYS_PATH_ROUTING,
    readCookie: (cookieName) => cookieStore.get(cookieName)?.value,
    acceptLanguageHeader: headerStore.get('accept-language'),
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
  props?: Partial<Pick<WaysRootProps, 'locale' | 'baseLocale'>>
): Promise<Record<string, string>> => {
  const { locale } = await resolveLocaleFromRequest(props);

  return {
    lang: locale,
    dir: isRtlLocale(locale) ? 'rtl' : 'ltr',
  };
};

const resolveRequestPaths = async (
  locale: string
): Promise<{ pathname: string; localizedPathname: string }> => {
  const headerStore = await headers();

  const pathname = normalizePathname(headerStore.get(WAYS_PATHNAME_HEADER_NAME) || '/');
  const localizedPathname = normalizePathname(
    headerStore.get(WAYS_LOCALIZED_PATHNAME_HEADER_NAME) || buildLocalizedPathname(pathname, locale)
  );

  return {
    pathname,
    localizedPathname,
  };
};

export const generateWaysMetadata = async (
  props?: Partial<Pick<WaysRootProps, 'locale' | 'baseLocale'>> & { origin?: string }
): Promise<Record<string, any>> => {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const { locale, supportedLocales } = await resolveLocaleFromRequest(props);
  const fallbackLocale = props?.baseLocale || props?.locale || locale;
  const { pathname, localizedPathname } = await resolveRequestPaths(locale);

  const origin = resolveOrigin({
    explicitOrigin: props?.origin,
    host: headerStore.get('x-forwarded-host') || headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });

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

  return {
    metadataBase: new URL(origin),
    alternates: {
      canonical: joinOriginAndPathname(origin, localizedPathname),
      languages: alternatesLanguages,
    },
    openGraph: {
      locale: localeToOpenGraphLocale(locale),
      alternateLocale: supportedLocales
        .filter((supportedLocale) => supportedLocale !== locale)
        .map(localeToOpenGraphLocale),
    },
    other: {
      '18ways-locale': locale,
      '18ways-locale-cookie': cookieStore.get(WAYS_LOCALE_COOKIE_NAME)?.value || '',
    },
  };
};

export async function Ways(props: WaysProps): Promise<React.JSX.Element> {
  if (!('apiKey' in props)) {
    return <ClientWays {...props} />;
  }

  const resolved = await resolveLocaleFromRequest(props);
  const locale = props.locale || resolved.locale;
  const { localizedPathname } = await resolveRequestPaths(locale);
  const knownLocales =
    Array.isArray(props.acceptedLocales) && props.acceptedLocales.length
      ? props.acceptedLocales
      : resolved.supportedLocales;
  const localePath = extractLocalePrefix(localizedPathname, knownLocales);

  if (
    localePath.locale &&
    localePath.locale !== locale &&
    isPathRoutingEnabled(localePath.unlocalizedPathname, DEFAULT_WAYS_PATH_ROUTING)
  ) {
    redirect(buildLocalizedPathname(localePath.unlocalizedPathname, locale));
  }

  return (
    <ClientWays
      {...props}
      locale={locale}
      requestOrigin={resolved.requestOrigin}
      acceptedLocales={resolved.supportedLocales}
    />
  );
}

export type { WaysProps, WaysRootProps };
export { WAYS_LOCALE_COOKIE_NAME };
