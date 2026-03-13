import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import {
  Ways as ServerWays,
  generateWaysMetadata as generateWaysMetadataBase,
  getWaysHtmlAttrs as getWaysHtmlAttrsBase,
} from './rsc';
import type { WaysProps, WaysRootProps } from '@18ways/react';
import { LocalePathSync } from './next-locale-sync';
import { LocaleRuntimeConfigProvider } from './next-locale-runtime';
import {
  SUPPORTED_LOCALES,
  WAYS_LOCALE_COOKIE_NAME,
  WaysPathRoutingConfig,
  normalizePathname,
  recognizeLocale,
} from '@18ways/core/i18n-shared';
import { LocaleSyncMode } from '@18ways/core/locale-engine';
import {
  createNextLocaleEngine,
  type NextLocaleCookieWriteOptions,
  type NextLocaleDriverContext,
  type PathLocaleResolution,
} from './next-locale-drivers';
import { cloneDeepValue, deepMerged } from '@18ways/core/object-utils';
import {
  _composeRequestInitDecorators,
  fetchAcceptedLocales,
  resolveOrigin,
} from '@18ways/core/common';
import { createNextRequestInitDecorator } from './next-request-init';
import {
  WAYS_LOCALE_HEADER_NAME,
  WAYS_LOCALIZED_PATHNAME_HEADER_NAME,
  WAYS_PATHNAME_HEADER_NAME,
} from './next-shared';

export {
  generateWaysMetadataBase as generateWaysMetadata,
  getWaysHtmlAttrsBase as getWaysHtmlAttrs,
  WAYS_LOCALE_COOKIE_NAME,
};
export type { WaysProps, WaysRootProps };

export type WaysNextInitOptions = Omit<WaysRootProps, 'children' | 'context'> & {
  pathRouting?: WaysPathRoutingConfig;
};

export type WaysRootComponentProps = {
  children: React.ReactNode;
};

export type WaysMetadataTranslator = (text: string) => string;
export type WaysMetadataFactory = (
  t: WaysMetadataTranslator
) => Record<string, any> | Promise<Record<string, any>>;
export type WaysMetadataInput = Record<string, any> | WaysMetadataFactory;

export type WaysNextInitResult = {
  WaysRoot: (props: WaysRootComponentProps) => Promise<React.JSX.Element>;
  htmlAttrs: () => Promise<Record<string, string>>;
  generateWaysMetadata: (
    metadata?: WaysMetadataInput,
    options?: { origin?: string }
  ) => Promise<Record<string, any>>;
  resolveWaysMiddlewareEdit: (
    request: NextRequest,
    options?: { syncMode?: LocaleSyncMode; persistLocaleCookie?: boolean }
  ) => Promise<(createResponse: WaysMiddlewareResponseFactory) => NextResponse>;
};

const METADATA_TRANSLATION_CONTEXT_KEY = '__18ways_metadata__';
const METADATA_STRING_PATHS: Array<string[]> = [
  ['title'],
  ['description'],
  ['openGraph', 'title'],
  ['openGraph', 'description'],
  ['twitter', 'title'],
  ['twitter', 'description'],
];

type MetadataTextEntry = {
  path: string[];
  value: string;
};

const getNestedValue = (obj: Record<string, any>, path: string[]): unknown => {
  let cursor: unknown = obj;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

const setNestedValue = (obj: Record<string, any>, path: string[], value: string): void => {
  let cursor: Record<string, any> = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    const currentValue = cursor[segment];
    if (!currentValue || typeof currentValue !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[path[path.length - 1]] = value;
};

const collectMetadataTextEntries = (metadata: Record<string, any>): MetadataTextEntry[] => {
  const entries: MetadataTextEntry[] = [];
  for (const path of METADATA_STRING_PATHS) {
    const value = getNestedValue(metadata, path);
    if (typeof value === 'string' && value.trim()) {
      entries.push({
        path,
        value,
      });
    }
  }
  return entries;
};

const buildMetadataTranslationMap = async (params: {
  texts: string[];
  targetLocale: string;
  baseLocale: string;
  initOptions: WaysNextInitOptions;
}): Promise<Map<string, string>> => {
  const { texts, targetLocale, baseLocale, initOptions } = params;

  if (targetLocale === baseLocale) {
    return new Map();
  }

  const normalizedTexts = Array.from(
    new Set(texts.map((text) => text.trim()).filter((text) => text.length > 0))
  );
  if (!normalizedTexts.length) {
    return new Map();
  }

  try {
    const common = await import('@18ways/core/common');
    const crypto = await import('@18ways/core/crypto');
    common.init({
      key: initOptions.apiKey,
      apiUrl: initOptions._apiUrl,
      fetcher: initOptions.fetcher,
      cacheTtlSeconds: initOptions.cacheTtl,
      origin: initOptions.requestOrigin,
      _requestInitDecorator: _composeRequestInitDecorators(
        createNextRequestInitDecorator(),
        initOptions._requestInitDecorator
      ),
    });

    const textsHash = common.generateHashId([
      METADATA_TRANSLATION_CONTEXT_KEY,
      baseLocale,
      targetLocale,
      normalizedTexts,
    ]);

    const seedResult = await common.fetchSeed([METADATA_TRANSLATION_CONTEXT_KEY], targetLocale);
    let translated =
      seedResult?.data &&
      typeof seedResult.data === 'object' &&
      !Array.isArray(seedResult.data) &&
      seedResult.data[METADATA_TRANSLATION_CONTEXT_KEY] &&
      typeof seedResult.data[METADATA_TRANSLATION_CONTEXT_KEY] === 'object'
        ? (seedResult.data[METADATA_TRANSLATION_CONTEXT_KEY] as Record<string, string[]>)[textsHash]
        : undefined;

    if (!translated || translated.length !== normalizedTexts.length) {
      const result = await common.fetchTranslations([
        {
          key: METADATA_TRANSLATION_CONTEXT_KEY,
          textsHash,
          baseLocale,
          targetLocale,
          texts: normalizedTexts,
        },
      ]);

      translated = result.data.find(
        (entry) =>
          entry.key === METADATA_TRANSLATION_CONTEXT_KEY &&
          entry.locale === targetLocale &&
          entry.textsHash === textsHash
      )?.translation;
    }

    if (!translated || translated.length !== normalizedTexts.length) {
      return new Map();
    }

    const decrypted = normalizedTexts.map((sourceText, index) => {
      const encryptedText = translated[index];
      if (typeof encryptedText !== 'string') {
        return sourceText;
      }

      try {
        return crypto.decryptTranslationValue({
          encryptedText,
          sourceText,
          locale: targetLocale,
          key: METADATA_TRANSLATION_CONTEXT_KEY,
          textsHash,
          index,
        });
      } catch {
        return sourceText;
      }
    });

    return new Map(normalizedTexts.map((text, index) => [text, decrypted[index] ?? text] as const));
  } catch {
    return new Map();
  }
};

const translateMetadataObject = async (params: {
  metadata: Record<string, any>;
  targetLocale: string;
  baseLocale: string;
  initOptions: WaysNextInitOptions;
}): Promise<Record<string, any>> => {
  const { metadata, targetLocale, baseLocale, initOptions } = params;

  if (!metadata) {
    return metadata;
  }

  const entries = collectMetadataTextEntries(metadata);
  if (!entries.length || targetLocale === baseLocale) {
    return metadata;
  }

  const translationMap = await buildMetadataTranslationMap({
    texts: entries.map((entry) => entry.value),
    targetLocale,
    baseLocale,
    initOptions,
  });

  if (!translationMap.size) {
    return metadata;
  }

  const translatedMetadata = cloneDeepValue(metadata) as Record<string, any>;
  entries.forEach((entry) => {
    setNestedValue(translatedMetadata, entry.path, translationMap.get(entry.value) ?? entry.value);
  });

  return translatedMetadata;
};

const resolveMetadataInput = async (params: {
  metadata: WaysMetadataInput;
  targetLocale: string;
  baseLocale: string;
  initOptions: WaysNextInitOptions;
}): Promise<Record<string, any>> => {
  const { metadata, targetLocale, baseLocale, initOptions } = params;

  if (typeof metadata !== 'function') {
    return translateMetadataObject({
      metadata,
      targetLocale,
      baseLocale,
      initOptions,
    });
  }

  const collectedTexts: string[] = [];
  const firstPass = await metadata((text) => {
    if (typeof text === 'string' && text.trim()) {
      collectedTexts.push(text);
    }
    return text;
  });

  const translationMap = await buildMetadataTranslationMap({
    texts: collectedTexts,
    targetLocale,
    baseLocale,
    initOptions,
  });

  if (!translationMap.size) {
    return firstPass;
  }

  return metadata((text) => translationMap.get(text) ?? text);
};

export const init = (options: WaysNextInitOptions): WaysNextInitResult => {
  const { pathRouting, ...waysRootOptions } = options;
  const defaultAcceptedLocales = waysRootOptions.acceptedLocales;
  const defaultMiddlewareOptions = createWaysMiddlewareOptions({
    baseLocale: waysRootOptions.baseLocale,
    pathRouting,
    acceptedLocales: defaultAcceptedLocales,
    supportedLocales: defaultAcceptedLocales,
  });
  const rootProps = { ...waysRootOptions };
  const localeProps: Partial<
    Pick<WaysRootProps, 'locale' | 'baseLocale' | 'apiKey' | '_apiUrl'>
  > & {
    pathRouting?: WaysPathRoutingConfig;
    _requestInitDecorator?: WaysRootProps['_requestInitDecorator'];
  } = {
    locale: waysRootOptions.locale,
    baseLocale: waysRootOptions.baseLocale,
    apiKey: waysRootOptions.apiKey,
    _apiUrl: waysRootOptions._apiUrl,
    _requestInitDecorator: waysRootOptions._requestInitDecorator,
    pathRouting,
  };
  const WaysRoot = async ({ children }: WaysRootComponentProps): Promise<React.JSX.Element> => {
    return Ways({ ...rootProps, pathRouting, children });
  };

  const htmlAttrs = async (): Promise<Record<string, string>> => {
    return getWaysHtmlAttrsBase(localeProps);
  };

  const generateWaysMetadata = async (
    metadata?: WaysMetadataInput,
    metadataOptions?: { origin?: string }
  ): Promise<Record<string, any>> => {
    const waysMetadata = await generateWaysMetadataBase({
      ...localeProps,
      origin: metadataOptions?.origin,
    });

    if (!metadata) {
      return waysMetadata;
    }

    const resolvedLocale =
      (waysMetadata?.other && typeof waysMetadata.other['18ways_locale'] === 'string'
        ? waysMetadata.other['18ways_locale']
        : undefined) ||
      localeProps.locale ||
      localeProps.baseLocale ||
      'en-GB';
    const resolvedBaseLocale = localeProps.baseLocale || localeProps.locale || resolvedLocale;
    const metadataBaseValue = waysMetadata?.metadataBase;
    const metadataBaseOrigin =
      metadataBaseValue instanceof URL
        ? metadataBaseValue.origin
        : typeof metadataBaseValue === 'string'
          ? (() => {
              try {
                return new URL(metadataBaseValue).origin;
              } catch {
                return undefined;
              }
            })()
          : undefined;
    const requestOrigin = resolveOrigin({
      explicitOrigin: metadataOptions?.origin || metadataBaseOrigin,
    });

    const translatedMetadata = await resolveMetadataInput({
      metadata,
      targetLocale: resolvedLocale,
      baseLocale: resolvedBaseLocale,
      initOptions: {
        ...waysRootOptions,
        requestOrigin,
      },
    });

    return deepMerged(translatedMetadata, waysMetadata);
  };

  const resolveWaysMiddlewareEditFromInit = async (
    request: NextRequest,
    middlewareOptions?: { syncMode?: LocaleSyncMode }
  ) => {
    const resolvedBaseLocale = recognizeLocale(waysRootOptions.baseLocale) || 'en-GB';
    const acceptedLocales =
      defaultAcceptedLocales ||
      (waysRootOptions.apiKey
        ? await fetchAcceptedLocales(resolvedBaseLocale, {
            apiUrl: waysRootOptions._apiUrl,
            origin: resolveOrigin({
              host: request.headers.get('x-forwarded-host') || request.headers.get('host'),
              forwardedProto: request.headers.get('x-forwarded-proto'),
            }),
            apiKey: waysRootOptions.apiKey,
            _requestInitDecorator: _composeRequestInitDecorators(
              createNextRequestInitDecorator(),
              waysRootOptions._requestInitDecorator
            ),
          })
        : [...SUPPORTED_LOCALES]);

    return resolveWaysMiddlewareEdit(request, {
      ...defaultMiddlewareOptions,
      acceptedLocales,
      supportedLocales: acceptedLocales,
      syncMode: middlewareOptions?.syncMode,
    });
  };

  return {
    WaysRoot,
    htmlAttrs,
    generateWaysMetadata,
    resolveWaysMiddlewareEdit: resolveWaysMiddlewareEditFromInit,
  };
};

type WaysNextProps = WaysProps & {
  pathRouting?: WaysPathRoutingConfig;
};
const LocalePathSyncComponent = LocalePathSync as React.ComponentType<{
  pathRouting?: WaysPathRoutingConfig;
}>;

export function Ways(props: WaysNextProps): React.JSX.Element {
  if ('apiKey' in props) {
    const { pathRouting, ...serverWaysProps } = props;
    const children = pathRouting
      ? React.createElement(
          LocaleRuntimeConfigProvider,
          { pathRouting },
          React.createElement(
            React.Fragment,
            null,
            React.createElement(LocalePathSyncComponent, { pathRouting }),
            props.children
          )
        )
      : props.children;

    return React.createElement(ServerWays, serverWaysProps, children);
  }

  return React.createElement(ServerWays, props, props.children);
}

type WaysCookieUpdate = {
  name: string;
  value: string;
  options: {
    maxAge?: number;
    sameSite: 'lax';
    secure: boolean;
    path: string;
  };
};

export type WaysMiddlewareOptions = {
  baseLocale?: string;
  pathRouting?: WaysPathRoutingConfig;
  syncMode?: LocaleSyncMode;
  acceptedLocales?: string[];
  supportedLocales?: string[];
  persistLocaleCookie?: boolean;
};

export type WaysMiddlewareResolution =
  | {
      action: 'redirect';
      locale: string;
      redirectPathname: string;
      unlocalizedPathname: string;
      localizedPathname: string;
      requestHeaders: Headers;
      cookieUpdates: WaysCookieUpdate[];
    }
  | {
      action: 'rewrite';
      locale: string;
      rewritePathname: string;
      unlocalizedPathname: string;
      localizedPathname: string;
      requestHeaders: Headers;
      cookieUpdates: WaysCookieUpdate[];
    }
  | {
      action: 'continue';
      locale: string;
      unlocalizedPathname: string;
      localizedPathname: string;
      requestHeaders: Headers;
      cookieUpdates: WaysCookieUpdate[];
    };

type WaysMiddlewareState = {
  secureCookies: boolean;
  cookieUpdates: Map<string, WaysCookieUpdate>;
  unlocalizedPathname: string;
  localizedPathname: string;
  rewritePathname?: string;
  redirectPathname?: string;
};

type WaysMiddlewareContext = NextLocaleDriverContext;

export const createWaysMiddlewareOptions = (input: {
  baseLocale?: string;
  pathRouting?: WaysPathRoutingConfig;
  syncMode?: LocaleSyncMode;
  acceptedLocales?: string[];
  supportedLocales?: string[];
  persistLocaleCookie?: boolean;
}): WaysMiddlewareOptions => {
  return {
    baseLocale: input.baseLocale,
    pathRouting: input.pathRouting,
    syncMode: input.syncMode,
    acceptedLocales: input.acceptedLocales,
    supportedLocales: input.supportedLocales,
    persistLocaleCookie: input.persistLocaleCookie,
  };
};

const setCookieUpdate = (state: WaysMiddlewareState, update: WaysCookieUpdate): void => {
  state.cookieUpdates.set(update.name, update);
};

const writeCookieUpdate = (
  state: WaysMiddlewareState,
  cookieName: string,
  value: string,
  options?: NextLocaleCookieWriteOptions
): void => {
  setCookieUpdate(state, {
    name: cookieName,
    value,
    options: {
      maxAge: options?.maxAge,
      sameSite: options?.sameSite || 'lax',
      secure: typeof options?.secure === 'boolean' ? options.secure : state.secureCookies,
      path: options?.path || '/',
    },
  });
};

const applyPathLocaleResolution = (
  state: WaysMiddlewareState,
  resolution: PathLocaleResolution
): void => {
  state.unlocalizedPathname = normalizePathname(resolution.unlocalizedPathname);
  state.localizedPathname = normalizePathname(resolution.localizedPathname);
  state.rewritePathname = resolution.rewritePathname
    ? normalizePathname(resolution.rewritePathname)
    : undefined;
  state.redirectPathname = resolution.redirectPathname
    ? normalizePathname(resolution.redirectPathname)
    : undefined;
};

const createWaysMiddlewareContext = (input: {
  request: NextRequest;
  baseLocale: string;
  pathRouting?: WaysPathRoutingConfig;
  supportedLocales?: string[];
  acceptedLocales?: string[];
  persistLocaleCookie?: boolean;
}): {
  context: WaysMiddlewareContext;
  state: WaysMiddlewareState;
} => {
  const normalizedPathname = normalizePathname(input.request.nextUrl.pathname);
  const state: WaysMiddlewareState = {
    secureCookies: process.env.NODE_ENV === 'production',
    cookieUpdates: new Map(),
    unlocalizedPathname: normalizedPathname,
    localizedPathname: normalizedPathname,
  };

  const context: WaysMiddlewareContext = {
    pathname: normalizedPathname,
    baseLocale: input.baseLocale,
    supportedLocales: input.supportedLocales,
    acceptedLocales: input.acceptedLocales,
    pathRouting: input.pathRouting,
    persistLocaleCookie: input.persistLocaleCookie,
    readCookie: (cookieName) => input.request.cookies.get(cookieName)?.value || null,
    writeCookie: (cookieName, locale, cookieOptions) => {
      writeCookieUpdate(state, cookieName, locale, cookieOptions);
    },
    acceptLanguageHeader: input.request.headers.get('accept-language'),
    onPathLocaleResolution: (resolution) => {
      applyPathLocaleResolution(state, resolution);
    },
  };

  return { context, state };
};

const buildRequestHeaders = (
  request: NextRequest,
  locale: string,
  unlocalizedPathname: string,
  localizedPathname: string
): Headers => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WAYS_LOCALE_HEADER_NAME, locale);
  requestHeaders.set(WAYS_PATHNAME_HEADER_NAME, normalizePathname(unlocalizedPathname));
  requestHeaders.set(WAYS_LOCALIZED_PATHNAME_HEADER_NAME, normalizePathname(localizedPathname));
  return requestHeaders;
};

export const resolveWaysMiddleware = async (
  request: NextRequest,
  options?: WaysMiddlewareOptions
): Promise<WaysMiddlewareResolution> => {
  const baseLocale = recognizeLocale(options?.baseLocale) || 'en-GB';
  const pathRouting = options?.pathRouting;
  const supportedLocales = options?.supportedLocales;
  const acceptedLocales = options?.acceptedLocales;
  const { context, state } = createWaysMiddlewareContext({
    request,
    baseLocale,
    pathRouting,
    supportedLocales,
    acceptedLocales,
    persistLocaleCookie: options?.persistLocaleCookie,
  });
  const engine = createNextLocaleEngine<WaysMiddlewareContext>({
    baseLocale,
    acceptedLocales,
  });

  const resolution = await engine.resolveAndSync(context, {
    mode: options?.syncMode || 'all',
  });

  const requestHeaders = buildRequestHeaders(
    request,
    resolution.locale,
    state.unlocalizedPathname,
    state.localizedPathname
  );
  const cookieUpdates = Array.from(state.cookieUpdates.values());

  if (state.redirectPathname) {
    return {
      action: 'redirect',
      locale: resolution.locale,
      redirectPathname: state.redirectPathname,
      unlocalizedPathname: state.unlocalizedPathname,
      localizedPathname: state.localizedPathname,
      requestHeaders,
      cookieUpdates,
    };
  }

  if (state.rewritePathname) {
    return {
      action: 'rewrite',
      locale: resolution.locale,
      rewritePathname: state.rewritePathname,
      unlocalizedPathname: state.unlocalizedPathname,
      localizedPathname: state.localizedPathname,
      requestHeaders,
      cookieUpdates,
    };
  }

  return {
    action: 'continue',
    locale: resolution.locale,
    unlocalizedPathname: state.unlocalizedPathname,
    localizedPathname: state.localizedPathname,
    requestHeaders,
    cookieUpdates,
  };
};

const copyResponseCookies = (source: NextResponse, target: NextResponse) => {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
};

const applyLocaleCookies = (response: NextResponse, cookieUpdates: WaysCookieUpdate[]) => {
  cookieUpdates.forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  });
};

export type WaysMiddlewareResponseFactory = (options?: {
  requestHeaders?: Headers;
  rewritePathname?: string;
}) => NextResponse;

export const createWaysResponseEdit = (
  request: NextRequest,
  resolution: WaysMiddlewareResolution
) => {
  return (createResponse: WaysMiddlewareResponseFactory): NextResponse => {
    if (resolution.action === 'redirect') {
      const seedResponse = createResponse({
        requestHeaders: resolution.requestHeaders,
      });
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = resolution.redirectPathname;
      const response = NextResponse.redirect(redirectUrl);
      copyResponseCookies(seedResponse, response);
      applyLocaleCookies(response, resolution.cookieUpdates);
      return response;
    }

    if (resolution.action === 'rewrite') {
      const response = createResponse({
        requestHeaders: resolution.requestHeaders,
        rewritePathname: resolution.rewritePathname,
      });
      applyLocaleCookies(response, resolution.cookieUpdates);
      return response;
    }

    const response = createResponse({
      requestHeaders: resolution.requestHeaders,
    });
    applyLocaleCookies(response, resolution.cookieUpdates);
    return response;
  };
};

export const resolveWaysMiddlewareEdit = async (
  request: NextRequest,
  options?: WaysMiddlewareOptions
) => {
  const resolution = await resolveWaysMiddleware(request, options);
  return createWaysResponseEdit(request, resolution);
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const resolution = await resolveWaysMiddleware(request);
  const applyWays = createWaysResponseEdit(request, resolution);
  return applyWays(({ requestHeaders, rewritePathname } = {}) => {
    if (rewritePathname) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = rewritePathname;
      return NextResponse.rewrite(rewriteUrl, {
        request: {
          headers: requestHeaders || request.headers,
        },
      });
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders || request.headers,
      },
    });
  });
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
