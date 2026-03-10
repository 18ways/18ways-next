'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useCurrentLocale, useSetCurrentLocale } from '@18ways/react';
import { LocaleEngine } from '@18ways/core/locale-engine';
import {
  DEFAULT_WAYS_PATH_ROUTING,
  WaysPathRoutingConfig,
  buildLocalizedPathname,
  canonicalizeLocale,
  extractRecognizedLocalePrefix,
  findSupportedLocale,
  isPathRoutingEnabled,
  normalizePathname,
  recognizeLocale,
} from '@18ways/core/i18n-shared';
import { createNextLocaleDrivers, type NextLocaleDriverContext } from './next-locale-drivers';
import { useLocaleRuntimePathRouting } from './next-locale-runtime';

const normalizeLocale = (locale: string): string => (recognizeLocale(locale) || '').toLowerCase();

const resolvePathRouting = (
  explicitPathRouting: WaysPathRoutingConfig | undefined,
  runtimePathRouting: WaysPathRoutingConfig | undefined
): WaysPathRoutingConfig | undefined => {
  return explicitPathRouting || runtimePathRouting || DEFAULT_WAYS_PATH_ROUTING;
};

const readAcceptedLocalesFromWindow = (): string[] => {
  if (typeof window === 'undefined' || !Array.isArray(window.__18WAYS_ACCEPTED_LOCALES__)) {
    return [];
  }

  return Array.from(
    new Set(
      window.__18WAYS_ACCEPTED_LOCALES__
        .map((locale) => recognizeLocale(locale))
        .filter((locale): locale is string => Boolean(locale))
        .map((locale) => canonicalizeLocale(locale))
    )
  );
};

const matchesLocaleSegment = (
  segment: string,
  options?: { locale?: string; acceptedLocales?: string[] }
): boolean => {
  const recognizedSegment = recognizeLocale(segment);
  if (!recognizedSegment) {
    return false;
  }

  const normalizedSegment = normalizeLocale(recognizedSegment);
  if (!normalizedSegment) {
    return false;
  }

  if (options?.acceptedLocales?.length) {
    return options.acceptedLocales.some((locale) => normalizeLocale(locale) === normalizedSegment);
  }

  if (options?.locale) {
    return normalizeLocale(options.locale) === normalizedSegment;
  }

  return true;
};

export const stripLocalePrefix = (
  pathname: string,
  options?: { locale?: string; acceptedLocales?: string[] }
): string => {
  const normalizedPathname = normalizePathname(pathname);
  const segments = normalizedPathname.split('/').filter(Boolean);
  if (!segments.length) {
    return '/';
  }

  if (!matchesLocaleSegment(segments[0], options)) {
    return normalizedPathname;
  }

  const remainingSegments = segments.slice(1);
  return remainingSegments.length ? `/${remainingSegments.join('/')}` : '/';
};

export const localizePathname = (
  pathname: string,
  locale: string,
  options?: {
    acceptedLocales?: string[];
    currentLocale?: string;
    pathRouting?: WaysPathRoutingConfig;
  }
): string => {
  const recognizedLocale = recognizeLocale(locale);
  if (!recognizedLocale) {
    return normalizePathname(pathname);
  }

  const normalizedPathname = normalizePathname(pathname);
  let basePathname = stripLocalePrefix(normalizedPathname, {
    locale: options?.currentLocale,
    acceptedLocales: options?.acceptedLocales,
  });

  // If current locale state is stale (for example after a redirect),
  // avoid stacking duplicate locale prefixes like /ja-JP/ja-JP.
  if (basePathname === normalizedPathname) {
    basePathname = stripLocalePrefix(normalizedPathname, { locale: recognizedLocale });
  }

  const effectivePathRouting = options?.pathRouting || DEFAULT_WAYS_PATH_ROUTING;
  if (!isPathRoutingEnabled(basePathname, effectivePathRouting)) {
    return basePathname;
  }

  return buildLocalizedPathname(basePathname, recognizedLocale);
};

export const useUnlocalizedPathname = (options?: {
  pathRouting?: WaysPathRoutingConfig;
}): string => {
  const pathname = usePathname();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);
  const normalizedPathname = normalizePathname(pathname || '/');
  const pathInfo = extractRecognizedLocalePrefix(normalizedPathname);

  if (!isPathRoutingEnabled(pathInfo.unlocalizedPathname, effectivePathRouting)) {
    return normalizedPathname;
  }

  return pathInfo.unlocalizedPathname;
};

export const useLocalizedHref = (options?: {
  pathRouting?: WaysPathRoutingConfig;
}): ((href: string) => string) => {
  const locale = useCurrentLocale();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);

  return useCallback(
    (href: string) => {
      if (!href.startsWith('/')) {
        return href;
      }

      return localizePathname(href, locale, {
        currentLocale: locale,
        pathRouting: effectivePathRouting,
      });
    },
    [effectivePathRouting, locale]
  );
};

export type SetLocaleOptions = {
  history?: 'replace' | 'push';
  preserveSearch?: boolean;
  preserveHash?: boolean;
  persistLocaleCookie?: boolean;
};

export type UseLocaleOptions = {
  pathRouting?: WaysPathRoutingConfig;
  persistLocaleCookie?: boolean;
};

type ClientLocaleEngineContext = NextLocaleDriverContext;

const createClientLocaleEngineContext = (input: {
  pathname: string;
  currentLocale: string;
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  persistLocaleCookie?: boolean;
  setCurrentLocale: (locale: string) => void;
  navigateToPathname?: (pathname: string) => void | Promise<void>;
  onLocaleSynced?: () => void | Promise<void>;
}): {
  context: ClientLocaleEngineContext;
} => {
  let navigated = false;
  const navigateToPathname = input.navigateToPathname
    ? async (nextPathname: string) => {
        navigated = true;
        await input.navigateToPathname?.(nextPathname);
      }
    : undefined;

  return {
    context: {
      pathname: input.pathname,
      baseLocale: recognizeLocale(input.currentLocale) || 'en-GB',
      acceptedLocales: input.acceptedLocales,
      pathRouting: input.pathRouting,
      persistLocaleCookie: input.persistLocaleCookie,
      currentLocale: input.currentLocale,
      setCurrentLocale: input.setCurrentLocale,
      navigateToPathname,
      onLocaleSynced: () => {
        if (navigated) {
          return;
        }
        return input.onLocaleSynced?.();
      },
    },
  };
};

export const useLocale = (
  options?: UseLocaleOptions
): {
  locale: string;
  setLocale: (nextLocale: string, options?: SetLocaleOptions) => void;
} => {
  const contextLocale = useCurrentLocale();
  const setCurrentLocale = useSetCurrentLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = contextLocale;
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);

  const setLocale = useCallback(
    (nextLocale: string, setLocaleOptions?: SetLocaleOptions) => {
      const recognizedNextLocale = recognizeLocale(nextLocale);
      if (!recognizedNextLocale || recognizedNextLocale === locale) {
        return;
      }

      const normalizedPathname = normalizePathname(pathname || '/');
      const acceptedLocales = readAcceptedLocalesFromWindow();
      const search =
        setLocaleOptions?.preserveSearch === false ? '' : searchParams?.toString() || '';
      const hash =
        setLocaleOptions?.preserveHash === false
          ? ''
          : typeof window !== 'undefined'
            ? window.location.hash
            : '';
      const persistLocaleCookie =
        typeof setLocaleOptions?.persistLocaleCookie === 'boolean'
          ? setLocaleOptions.persistLocaleCookie
          : options?.persistLocaleCookie;
      const { context } = createClientLocaleEngineContext({
        pathname: normalizedPathname,
        currentLocale: locale,
        acceptedLocales,
        pathRouting: effectivePathRouting,
        persistLocaleCookie,
        setCurrentLocale,
        navigateToPathname: (nextLocalizedPathname) => {
          const href = `${nextLocalizedPathname}${search ? `?${search}` : ''}${hash}`;
          if (setLocaleOptions?.history === 'push') {
            router.push(href);
            return;
          }

          router.replace(href);
        },
        onLocaleSynced: () => {
          router.refresh();
        },
      });
      const localeEngine = new LocaleEngine<ClientLocaleEngineContext>({
        baseLocale: context.baseLocale,
        drivers: createNextLocaleDrivers<ClientLocaleEngineContext>(),
        normalizeLocale: (candidateLocale) => {
          const recognized = recognizeLocale(candidateLocale);
          if (!recognized) {
            return '';
          }

          if (!acceptedLocales.length) {
            return recognized;
          }

          return findSupportedLocale(recognized, acceptedLocales) || '';
        },
      });

      void localeEngine.sync(context, recognizedNextLocale, { mode: 'all' }).catch((error) => {
        console.error('[18ways] Failed to sync locale on client:', error);
        setCurrentLocale(recognizedNextLocale);
        router.refresh();
      });
    },
    [effectivePathRouting, locale, pathname, router, searchParams, setCurrentLocale]
  );

  return {
    locale,
    setLocale,
  };
};
