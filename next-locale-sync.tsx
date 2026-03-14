'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useCurrentLocale, useSetCurrentLocale } from '@18ways/react';
import {
  WaysPathRoutingConfig,
  canonicalizeLocale,
  normalizePathname,
  recognizeLocale,
} from '@18ways/core/i18n-shared';
import { createNextLocaleEngine, type NextLocaleDriverContext } from './next-locale-drivers';
import { useLocaleRuntimePathRouting } from './next-locale-runtime';

type WaysWindow = Window &
  typeof globalThis & {
    __18WAYS_ACCEPTED_LOCALES__?: string[];
  };

type ClientLocaleSyncContext = NextLocaleDriverContext;

const createClientLocaleSyncContext = (input: {
  pathname: string;
  currentLocale: string;
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  setCurrentLocale: (locale: string) => void;
  navigateToPathname?: (pathname: string) => void;
}): ClientLocaleSyncContext => {
  return {
    pathname: input.pathname,
    baseLocale: recognizeLocale(input.currentLocale) || 'en-GB',
    acceptedLocales: input.acceptedLocales,
    pathRouting: input.pathRouting,
    currentLocale: input.currentLocale,
    setCurrentLocale: input.setCurrentLocale,
    navigateToPathname: input.navigateToPathname,
  };
};

const readAcceptedLocalesFromWindow = (): string[] => {
  const waysWindow = typeof window === 'undefined' ? null : (window as WaysWindow);
  if (!waysWindow || !Array.isArray(waysWindow.__18WAYS_ACCEPTED_LOCALES__)) {
    return [];
  }

  return Array.from(
    new Set(
      waysWindow.__18WAYS_ACCEPTED_LOCALES__
        .map((locale) => recognizeLocale(locale))
        .filter((locale): locale is string => Boolean(locale))
        .map((locale) => canonicalizeLocale(locale))
    )
  );
};

const resolveClientLocale = async (input: {
  pathname: string;
  currentLocale: string;
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  setCurrentLocale: (locale: string) => void;
}): Promise<void> => {
  const engineContext = createClientLocaleSyncContext({
    pathname: input.pathname,
    currentLocale: input.currentLocale,
    acceptedLocales: input.acceptedLocales,
    pathRouting: input.pathRouting,
    setCurrentLocale: input.setCurrentLocale,
  });
  const localeEngine = createNextLocaleEngine<ClientLocaleSyncContext>({
    baseLocale: engineContext.baseLocale,
    acceptedLocales: engineContext.acceptedLocales,
  });
  const resolution = await localeEngine.resolve(engineContext);

  if (resolution.locale === input.currentLocale) {
    return;
  }

  input.setCurrentLocale(resolution.locale);
};

const syncClientLocale = async (input: {
  targetLocale: string;
  pathname: string;
  currentLocale: string;
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  setCurrentLocale: (locale: string) => void;
  navigateToPathname: (pathname: string) => void;
}): Promise<void> => {
  const recognizedTargetLocale = recognizeLocale(input.targetLocale);
  if (!recognizedTargetLocale) {
    return;
  }

  const engineContext = createClientLocaleSyncContext({
    pathname: input.pathname,
    currentLocale: input.currentLocale,
    acceptedLocales: input.acceptedLocales,
    pathRouting: input.pathRouting,
    setCurrentLocale: input.setCurrentLocale,
    navigateToPathname: input.navigateToPathname,
  });
  const localeEngine = createNextLocaleEngine<ClientLocaleSyncContext>({
    baseLocale: engineContext.baseLocale,
    acceptedLocales: engineContext.acceptedLocales,
  });

  await localeEngine.sync(engineContext, recognizedTargetLocale, { mode: 'changed-only' });
};

export const LocalePathSync = ({ pathRouting }: { pathRouting?: WaysPathRoutingConfig } = {}) => {
  const pathname = normalizePathname(usePathname() || '/');
  const currentLocale = useCurrentLocale();
  const setCurrentLocale = useSetCurrentLocale();
  const router = useRouter();
  const runtimePathRouting = useLocaleRuntimePathRouting();
  const effectivePathRouting = pathRouting || runtimePathRouting;

  if (!effectivePathRouting) {
    return null;
  }

  const localeRef = useRef(currentLocale);
  const acceptedLocalesRef = useRef(readAcceptedLocalesFromWindow());
  const pathRoutingRef = useRef(effectivePathRouting);
  const hasResolvedInitialLocaleRef = useRef(false);

  useEffect(() => {
    localeRef.current = currentLocale;
  }, [currentLocale]);

  useEffect(() => {
    pathRoutingRef.current = effectivePathRouting;
  }, [effectivePathRouting]);

  useEffect(() => {
    acceptedLocalesRef.current = readAcceptedLocalesFromWindow();
  });

  useEffect(() => {
    if (hasResolvedInitialLocaleRef.current) {
      return;
    }

    hasResolvedInitialLocaleRef.current = true;
    void resolveClientLocale({
      pathname,
      currentLocale,
      acceptedLocales: acceptedLocalesRef.current,
      pathRouting: effectivePathRouting,
      setCurrentLocale,
    });
  }, [currentLocale, effectivePathRouting, pathname, setCurrentLocale]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const listenerContext = createClientLocaleSyncContext({
      pathname: normalizePathname(window.location.pathname || '/'),
      currentLocale: localeRef.current,
      acceptedLocales: acceptedLocalesRef.current,
      pathRouting: pathRoutingRef.current,
      setCurrentLocale,
      navigateToPathname: (nextPathname) => {
        const search = window.location.search || '';
        const hash = window.location.hash || '';
        router.replace(`${nextPathname}${search}${hash}`);
      },
    });
    const localeEngine = createNextLocaleEngine<ClientLocaleSyncContext>({
      baseLocale: listenerContext.baseLocale,
      acceptedLocales: listenerContext.acceptedLocales,
    });

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    const syncFromListeners = async (targetLocale: string) => {
      await syncClientLocale({
        targetLocale,
        pathname: normalizePathname(window.location.pathname || '/'),
        currentLocale: localeRef.current,
        acceptedLocales: acceptedLocalesRef.current,
        pathRouting: pathRoutingRef.current,
        setCurrentLocale,
        navigateToPathname: (nextPathname) => {
          const search = window.location.search || '';
          const hash = window.location.hash || '';
          router.replace(`${nextPathname}${search}${hash}`);
        },
      });
    };

    void localeEngine
      .handleListeners(listenerContext, syncFromListeners)
      .then((listenerCleanup) => {
        if (cancelled) {
          listenerCleanup();
          return;
        }

        cleanup = listenerCleanup;
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [effectivePathRouting, router, setCurrentLocale]);

  return null;
};
