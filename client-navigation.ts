'use client';

import { startTransition } from 'react';
import { suppressNextClientHistorySync } from '@18ways/core/client-locale-coordination';

type ClientRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

const suppressHistorySyncForHref = (href: string): URL | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const nextUrl = new URL(href, window.location.href);
    suppressNextClientHistorySync(nextUrl.pathname);
    return nextUrl;
  } catch {
    return null;
  }
};

const updateHistoryImmediately = (href: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUrl = suppressHistorySyncForHref(href);
  if (!nextUrl) {
    // Ignore malformed or unsupported hrefs and fall back to Next navigation.
    return;
  }

  const state = window.history.state;
  window.history.replaceState(state, '', nextUrl);
};

export const navigateClientLocaleHref = (router: ClientRouter, href: string): void => {
  updateHistoryImmediately(href);

  startTransition(() => {
    router.replace(href, { scroll: false });
  });
};
