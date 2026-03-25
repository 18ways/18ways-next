import { canonicalizeLocale, recognizeLocale } from '@18ways/core/i18n-shared';

export type WaysDomainConfig = {
  domain: string;
  defaultLocale: string;
  locales?: string[];
};

export type ResolvedWaysDomainConfig = {
  domain: string;
  defaultLocale: string;
  locales: string[];
};

const normalizeDomain = (domain: string): string => {
  return domain.trim().toLowerCase();
};

export const resolveWaysDomains = (
  baseLocale: string,
  domains?: WaysDomainConfig[]
): ResolvedWaysDomainConfig[] => {
  if (!Array.isArray(domains)) {
    return [];
  }

  return domains
    .map((domainEntry) => {
      const normalizedDomain = normalizeDomain(domainEntry.domain);
      const defaultLocale =
        recognizeLocale(domainEntry.defaultLocale) || recognizeLocale(baseLocale) || 'en-GB';
      const locales = Array.from(
        new Set(
          [defaultLocale, ...(domainEntry.locales || [])]
            .map((locale) => recognizeLocale(locale))
            .filter((locale): locale is string => Boolean(locale))
            .map((locale) => canonicalizeLocale(locale))
        )
      );

      if (!normalizedDomain || !locales.length) {
        return null;
      }

      return {
        domain: normalizedDomain,
        defaultLocale,
        locales,
      } satisfies ResolvedWaysDomainConfig;
    })
    .filter((domainEntry): domainEntry is ResolvedWaysDomainConfig => Boolean(domainEntry));
};

export const stripPortFromHost = (host: string | null | undefined): string => {
  if (!host) {
    return '';
  }

  return normalizeDomain(host.replace(/:\d+$/, ''));
};

export const findWaysDomainForHost = (
  host: string | null | undefined,
  domains?: ResolvedWaysDomainConfig[]
): ResolvedWaysDomainConfig | null => {
  const normalizedHost = stripPortFromHost(host);
  if (!normalizedHost || !domains?.length) {
    return null;
  }

  return domains.find((domainEntry) => domainEntry.domain === normalizedHost) || null;
};

export const findWaysDomainForLocale = (
  locale: string | null | undefined,
  domains?: ResolvedWaysDomainConfig[]
): ResolvedWaysDomainConfig | null => {
  const normalizedLocale = recognizeLocale(locale || '');
  if (!normalizedLocale || !domains?.length) {
    return null;
  }

  const canonicalLocale = canonicalizeLocale(normalizedLocale);

  return (
    domains.find((domainEntry) =>
      domainEntry.locales.some((supportedLocale) => supportedLocale === canonicalLocale)
    ) || null
  );
};

export const resolveDomainDefaultLocale = (
  host: string | null | undefined,
  domains?: ResolvedWaysDomainConfig[]
): string | null => {
  return findWaysDomainForHost(host, domains)?.defaultLocale || null;
};

export const buildLocaleOrigin = (
  requestOrigin: string,
  locale: string,
  domains?: ResolvedWaysDomainConfig[]
): string => {
  const matchedDomain = findWaysDomainForLocale(locale, domains);
  if (!matchedDomain) {
    return requestOrigin;
  }

  try {
    const nextOrigin = new URL(requestOrigin);
    nextOrigin.host = matchedDomain.domain;
    return nextOrigin.origin;
  } catch {
    return requestOrigin;
  }
};
