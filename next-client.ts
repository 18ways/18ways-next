'use client';

import NextLink from 'next/link';
import { useRouter as useAppRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRouter as useCompatRouter } from 'next/compat/router';
import type { UrlObject } from 'url';
import { createElement, useCallback, type ComponentProps } from 'react';
import { markClientLocaleSyncHandled } from '@18ways/core/client-locale-coordination';
import { useAcceptedLocales, useCurrentLocale, useSetCurrentLocale } from '@18ways/react';
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
import {
  useLocaleRuntimeDomains,
  useLocaleRuntimePathRouting,
  useLocaleRuntimePersistLocaleCookie,
  useWaysRouterMode,
} from './next-locale-runtime';
import { navigateClientLocaleHref } from './client-navigation';

export { localizePathname, stripLocalePrefix };

type HrefInput = string | UrlObject;

const resolvePathRouting = (
  explicitPathRouting: WaysPathRoutingConfig | undefined,
  runtimePathRouting: WaysPathRoutingConfig | undefined
): WaysPathRoutingConfig | undefined => {
  return explicitPathRouting || runtimePathRouting;
};

const stringifyHrefInput = (href: HrefInput): string => {
  if (typeof href === 'string') {
    return href;
  }

  const pathname = typeof href.pathname === 'string' ? href.pathname : '/';
  const searchParams = new URLSearchParams();
  if (href.query && typeof href.query === 'object') {
    Object.entries(href.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry != null) {
            searchParams.append(key, String(entry));
          }
        });
        return;
      }

      if (value != null) {
        searchParams.set(key, String(value));
      }
    });
  }

  const search = searchParams.toString();
  const hash = typeof href.hash === 'string' ? href.hash : '';
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
};

const localizeHrefInput = (
  href: HrefInput,
  locale: string,
  currentLocale: string,
  pathRouting?: WaysPathRoutingConfig
): HrefInput => {
  if (!pathRouting) {
    return href;
  }

  if (typeof href === 'string') {
    if (!href.startsWith('/')) {
      return href;
    }

    return localizePathname(href, locale, {
      currentLocale,
      pathRouting,
    });
  }

  if (typeof href.pathname !== 'string' || !href.pathname.startsWith('/')) {
    return href;
  }

  return {
    ...href,
    pathname: localizePathname(href.pathname, locale, {
      currentLocale,
      pathRouting,
    }),
  };
};

export const useUnlocalizedPathname = (options?: {
  pathRouting?: WaysPathRoutingConfig;
}): string => {
  const pathname = usePathname();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);
  const normalizedPathname = normalizePathname(pathname || '/');
  if (!effectivePathRouting) {
    return stripLocalePrefix(normalizedPathname);
  }
  const pathInfo = extractRecognizedLocalePrefix(normalizedPathname);

  if (!isPathRoutingEnabled(pathInfo.unlocalizedPathname, effectivePathRouting)) {
    return normalizedPathname;
  }

  return pathInfo.unlocalizedPathname;
};

export const useLocalizedHref = (options?: {
  pathRouting?: WaysPathRoutingConfig;
}): ((href: string, localeOverride?: string | false) => string) => {
  const locale = useCurrentLocale();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);

  return useCallback(
    (href: string, localeOverride?: string | false) => {
      if (!href.startsWith('/')) {
        return href;
      }

      if (localeOverride === false || !effectivePathRouting) {
        return stripLocalePrefix(href);
      }

      return localizePathname(href, localeOverride || locale, {
        currentLocale: locale,
        pathRouting: effectivePathRouting,
      });
    },
    [effectivePathRouting, locale]
  );
};

export type SetLocaleOptions = {
  preserveSearch?: boolean;
  preserveHash?: boolean;
};

export type UseLocaleOptions = {
  pathRouting?: WaysPathRoutingConfig;
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

const usePathLocale = (): {
  locale: string;
  setLocale: (nextLocale: string, options?: SetLocaleOptions) => void;
} => {
  const compatRouter = useCompatRouter();
  const currentLocale = useCurrentLocale();
  const setCurrentLocale = useSetCurrentLocale();

  const setLocale = useCallback(
    (nextLocale: string) => {
      const recognizedNextLocale = recognizeLocale(nextLocale);
      if (!compatRouter || !recognizedNextLocale || recognizedNextLocale === currentLocale) {
        return;
      }

      setCurrentLocale(recognizedNextLocale);
      void compatRouter.push(
        { pathname: compatRouter.pathname, query: compatRouter.query },
        compatRouter.asPath,
        { locale: recognizedNextLocale, scroll: false }
      );
    },
    [compatRouter, currentLocale, setCurrentLocale]
  );

  return {
    locale: currentLocale,
    setLocale,
  };
};

const useAppLocale = (
  options?: UseLocaleOptions
): {
  locale: string;
  setLocale: (nextLocale: string, options?: SetLocaleOptions) => void;
} => {
  const contextLocale = useCurrentLocale();
  const acceptedLocales = useAcceptedLocales();
  const setCurrentLocale = useSetCurrentLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useAppRouter();
  const locale = contextLocale;
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const runtimeDomains = useLocaleRuntimeDomains();
  const runtimePersistLocaleCookie = useLocaleRuntimePersistLocaleCookie();
  const effectivePathRouting = resolvePathRouting(options?.pathRouting, runtimePathRouting);

  const setLocale = useCallback(
    (nextLocale: string, setLocaleOptions?: SetLocaleOptions) => {
      const recognizedNextLocale = recognizeLocale(nextLocale);
      if (!recognizedNextLocale || recognizedNextLocale === locale) {
        return;
      }

      const normalizedPathname = normalizePathname(pathname || '/');
      const search =
        setLocaleOptions?.preserveSearch === false ? '' : searchParams?.toString() || '';
      const hash =
        setLocaleOptions?.preserveHash === false
          ? ''
          : typeof window !== 'undefined'
            ? window.location.hash
            : '';
      const persistLocaleCookie = runtimePersistLocaleCookie;
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
          navigateClientLocaleHref(router, href, {
            locale: recognizedNextLocale,
            domains: runtimeDomains,
            replace: true,
            historyOnly: true,
          });
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
    [
      effectivePathRouting,
      locale,
      pathname,
      router,
      runtimePersistLocaleCookie,
      runtimeDomains,
      acceptedLocales,
      searchParams,
      setCurrentLocale,
    ]
  );

  return {
    locale,
    setLocale,
  };
};

export const useLocale = (
  options?: UseLocaleOptions
): {
  locale: string;
  setLocale: (nextLocale: string, options?: SetLocaleOptions) => void;
} => {
  const routerMode = useWaysRouterMode();

  if (routerMode === 'path') {
    return usePathLocale();
  }

  return useAppLocale(options);
};

type WaysNavigationOptions = {
  scroll?: boolean;
  locale?: string | false;
};

export const useRouter = (): {
  push: (href: HrefInput, options?: WaysNavigationOptions) => void;
  replace: (href: HrefInput, options?: WaysNavigationOptions) => void;
  refresh: () => void;
  back: () => void;
  forward: () => void;
  prefetch: (href: string) => void | Promise<void>;
} => {
  const routerMode = useWaysRouterMode();
  const appRouter = useAppRouter();
  const compatRouter = useCompatRouter();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const runtimeDomains = useLocaleRuntimeDomains();
  const currentLocale = useCurrentLocale();

  const navigate = useCallback(
    (method: 'push' | 'replace', href: HrefInput, options?: WaysNavigationOptions) => {
      if (routerMode === 'path' && compatRouter) {
        const pagesHref = href;
        void compatRouter[method](
          pagesHref as never,
          undefined,
          options?.locale === undefined ? { scroll: options?.scroll } : options
        );
        return;
      }

      const targetLocale = options?.locale;
      const resolvedHref =
        targetLocale === false
          ? stringifyHrefInput(href)
          : stringifyHrefInput(
              localizeHrefInput(
                href,
                typeof targetLocale === 'string' ? targetLocale : currentLocale,
                currentLocale,
                runtimePathRouting
              )
            );

      if (method === 'replace') {
        navigateClientLocaleHref(appRouter, resolvedHref, {
          locale:
            typeof targetLocale === 'string'
              ? targetLocale
              : recognizeLocale(currentLocale) || 'en-GB',
          domains: runtimeDomains,
          replace: true,
        });
        return;
      }

      navigateClientLocaleHref(appRouter, resolvedHref, {
        locale:
          typeof targetLocale === 'string'
            ? targetLocale
            : recognizeLocale(currentLocale) || 'en-GB',
        domains: runtimeDomains,
        replace: false,
      });
    },
    [appRouter, compatRouter, currentLocale, routerMode, runtimeDomains, runtimePathRouting]
  );

  return {
    push: (href, options) => navigate('push', href, options),
    replace: (href, options) => navigate('replace', href, options),
    refresh: () => appRouter.refresh(),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: (href: string) => appRouter.prefetch(href),
  };
};

export type WaysLinkProps = Omit<ComponentProps<typeof NextLink>, 'locale'> & {
  locale?: string | false;
};

export function Link({ href, locale, ...props }: WaysLinkProps) {
  const routerMode = useWaysRouterMode();
  const currentLocale = useCurrentLocale();
  const runtimePathRouting = useLocaleRuntimePathRouting();

  if (routerMode === 'path') {
    return createElement(NextLink, { href, locale, ...props });
  }

  const resolvedHref =
    locale === false
      ? typeof href === 'string'
        ? stripLocalePrefix(href)
        : href
      : localizeHrefInput(
          href as HrefInput,
          typeof locale === 'string' ? locale : currentLocale,
          currentLocale,
          runtimePathRouting
        );

  return createElement(NextLink, { href: resolvedHref, ...props });
}
