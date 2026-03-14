'use client';

import { startTransition } from 'react';
import { suppressNextClientHistorySync } from '@18ways/core/client-locale-coordination';

type ClientRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

const updateHistoryImmediately = (href: string, history: 'push' | 'replace'): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const nextUrl = new URL(href, window.location.href);
    const state = window.history.state;
    suppressNextClientHistorySync(nextUrl.pathname);

    if (history === 'push') {
      window.history.pushState(state, '', nextUrl);
      return;
    }

    window.history.replaceState(state, '', nextUrl);
  } catch {
    // Ignore malformed or unsupported hrefs and fall back to Next navigation.
  }
};

export const navigateClientLocaleHref = (
  router: ClientRouter,
  href: string,
  history: 'push' | 'replace' = 'replace'
): void => {
  updateHistoryImmediately(href, history);

  startTransition(() => {
    if (history === 'push') {
      router.push(href, { scroll: false });
      return;
    }

    router.replace(href, { scroll: false });
  });
};
