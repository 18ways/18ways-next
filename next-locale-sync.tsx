'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { readAcceptedLocalesFromWindow } from '@18ways/core/client-accepted-locales';
import { consumeHandledClientLocaleSync } from '@18ways/core/client-locale-coordination';
import { useCurrentLocale, useSetCurrentLocale } from '@18ways/react';
import {
  WaysPathRoutingConfig,
  normalizePathname,
  recognizeLocale,
} from '@18ways/core/i18n-shared';
import { createNextLocaleEngine, type NextLocaleDriverContext } from './next-locale-drivers';
import { useLocaleRuntimePathRouting } from './next-locale-runtime';
import { navigateClientLocaleHref } from './client-navigation';

type ClientLocaleSyncContext = NextLocaleDriverContext;

const createClientLocaleSyncContext = (input: {
  pathname: string;
  currentLocale: string;
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  setCurrentLocale: (locale: string) => void;
  navigateToPathname?: (pathname: string) => void;
  onLocaleSynced?: (locale: string) => void;
}): ClientLocaleSyncContext => {
  return {
    pathname: input.pathname,
    baseLocale: recognizeLocale(input.currentLocale) || 'en-GB',
    acceptedLocales: input.acceptedLocales,
    pathRouting: input.pathRouting,
    currentLocale: input.currentLocale,
    setCurrentLocale: input.setCurrentLocale,
    navigateToPathname: input.navigateToPathname,
    onLocaleSynced: input.onLocaleSynced,
  };
};

const resolveClientLocale = async (input: {
  pathname: string;
  currentLocale: string;
  acceptedLocales?: string[];
  pathRouting?: WaysPathRoutingConfig;
  setCurrentLocale: (locale: string) => void;
  navigateToPathname: (pathname: string) => void;
}): Promise<void> => {
  const engineContext = createClientLocaleSyncContext({
    pathname: input.pathname,
    currentLocale: input.currentLocale,
    acceptedLocales: input.acceptedLocales,
    pathRouting: input.pathRouting,
    setCurrentLocale: input.setCurrentLocale,
    navigateToPathname: input.navigateToPathname,
    onLocaleSynced: input.setCurrentLocale,
  });
  const localeEngine = createNextLocaleEngine<ClientLocaleSyncContext>({
    baseLocale: engineContext.baseLocale,
    acceptedLocales: engineContext.acceptedLocales,
  });

  await localeEngine.resolveAndSync(engineContext, { mode: 'changed-only' });
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
  const hasStartedInitialLocaleResolutionRef = useRef(false);
  const hasCompletedInitialLocaleResolutionRef = useRef(false);

  const replacePathname = (nextPathname: string) => {
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    navigateClientLocaleHref(router, `${nextPathname}${search}${hash}`);
  };

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
    if (
      hasStartedInitialLocaleResolutionRef.current ||
      hasCompletedInitialLocaleResolutionRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    let cancelled = false;
    hasStartedInitialLocaleResolutionRef.current = true;

    void resolveClientLocale({
      pathname,
      currentLocale,
      acceptedLocales: acceptedLocalesRef.current,
      pathRouting: effectivePathRouting,
      setCurrentLocale,
      navigateToPathname: replacePathname,
    }).finally(() => {
      if (cancelled) {
        return;
      }

      hasCompletedInitialLocaleResolutionRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [currentLocale, effectivePathRouting, pathname, router, setCurrentLocale]);

  useEffect(() => {
    if (!hasCompletedInitialLocaleResolutionRef.current || typeof window === 'undefined') {
      return;
    }

    if (consumeHandledClientLocaleSync(currentLocale)) {
      return;
    }

    void syncClientLocale({
      targetLocale: currentLocale,
      pathname,
      currentLocale,
      acceptedLocales: acceptedLocalesRef.current,
      pathRouting: effectivePathRouting,
      setCurrentLocale,
      navigateToPathname: replacePathname,
    });
  }, [currentLocale, effectivePathRouting, pathname, router, setCurrentLocale]);

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
      navigateToPathname: replacePathname,
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
        navigateToPathname: replacePathname,
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
