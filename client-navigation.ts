'use client';

import { startTransition } from 'react';
import { suppressNextClientHistorySync } from '@18ways/core/client-locale-coordination';
import type { WaysDomainConfig } from './next-domains';
import { buildLocaleOrigin, resolveWaysDomains } from './next-domains';

type ClientRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
  push: (href: string, options?: { scroll?: boolean }) => void;
};

const resolveDomainAwareHref = (
  href: string,
  locale: string,
  domains?: WaysDomainConfig[]
): string => {
  if (typeof window === 'undefined') {
    return href;
  }

  try {
    const nextUrl = new URL(href, window.location.href);
    const resolvedDomains = resolveWaysDomains(locale, domains);
    const targetOrigin = buildLocaleOrigin(window.location.origin, locale, resolvedDomains);
    if (targetOrigin !== window.location.origin) {
      const crossDomainUrl = new URL(href, targetOrigin);
      return crossDomainUrl.toString();
    }
    return nextUrl.pathname + nextUrl.search + nextUrl.hash;
  } catch {
    return href;
  }
};

const updateHistoryImmediately = (href: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.origin !== window.location.origin) {
      return;
    }

    suppressNextClientHistorySync(nextUrl.pathname);
    window.history.replaceState(window.history.state, '', nextUrl);
  } catch {
    // Ignore malformed hrefs and fall back to Next navigation.
  }
};

export const navigateClientLocaleHref = (
  router: ClientRouter,
  href: string,
  options: {
    locale: string;
    domains?: WaysDomainConfig[];
    replace?: boolean;
  }
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const nextHref = resolveDomainAwareHref(href, options.locale, options.domains);
  if (!nextHref) {
    return;
  }

  if (/^https?:\/\//.test(nextHref)) {
    if (options.replace) {
      window.location.replace(nextHref);
      return;
    }

    window.location.assign(nextHref);
    return;
  }

  if (options.replace) {
    updateHistoryImmediately(nextHref);
  }

  startTransition(() => {
    if (options.replace) {
      router.replace(nextHref, { scroll: false });
      return;
    }

    router.push(nextHref, { scroll: false });
  });
};
