'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { readAcceptedLocalesFromWindow } from '@18ways/core/client-accepted-locales';
import { markClientLocaleSyncHandled } from '@18ways/core/client-locale-coordination';
import { useCurrentLocale, useSetCurrentLocale } from '@18ways/react';
import {
  WaysPathRoutingConfig,
  extractRecognizedLocalePrefix,
  isPathRoutingEnabled,
  localizePathname,
  normalizePathname,
  recognizeLocale,
  stripLocalePrefix,
} from '@18ways/core/i18n-shared';
import { createNextLocaleEngine, type NextLocaleDriverContext } from './next-locale-drivers';
import { useLocaleRuntimePathRouting } from './next-locale-runtime';
import { navigateClientLocaleHref } from './client-navigation';

export { localizePathname, stripLocalePrefix };

const resolvePathRouting = (
  explicitPathRouting: WaysPathRoutingConfig | undefined,
  runtimePathRouting: WaysPathRoutingConfig | undefined
): WaysPathRoutingConfig | undefined => {
  return explicitPathRouting || runtimePathRouting;
};

export const useUnlocalizedPathname = (options?: {
  pathRouting?: WaysPathRoutingConfig;
}): string => {
  const pathname = usePathname();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);
  const normalizedPathname = normalizePathname(pathname || '/');
  if (!effectivePathRouting) {
    return normalizedPathname;
  }
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

      if (!effectivePathRouting) {
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
      if (effectivePathRouting) {
        markClientLocaleSyncHandled(recognizedNextLocale);
      }
      const { context } = createClientLocaleEngineContext({
        pathname: normalizedPathname,
        currentLocale: locale,
        acceptedLocales,
        pathRouting: effectivePathRouting,
        persistLocaleCookie,
        setCurrentLocale,
        navigateToPathname: (nextLocalizedPathname) => {
          const href = `${nextLocalizedPathname}${search ? `?${search}` : ''}${hash}`;
          navigateClientLocaleHref(router, href, setLocaleOptions?.history || 'replace');
        },
        onLocaleSynced: () => {
          router.refresh();
        },
      });
      const localeEngine = createNextLocaleEngine<ClientLocaleEngineContext>({
        baseLocale: context.baseLocale,
        acceptedLocales,
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
