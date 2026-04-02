import React from 'react';
import {
  Ways as ServerWays,
  generateWaysMetadata as generateWaysMetadataBase,
  getWaysHtmlAttrs as getWaysHtmlAttrsBase,
  WAYS_LOCALE_COOKIE_NAME,
} from './rsc';
import type { WaysProps, WaysRootProps } from '@18ways/react';
import { recognizeLocale } from '@18ways/core/i18n-shared';
import { cloneDeepValue, deepMerged } from '@18ways/core/object-utils';
import {
  _composeRequestInitDecorators,
  resolveAcceptedLocales,
  resolveOrigin,
} from '@18ways/core/common';
import { createNextRequestInitDecorator } from './next-request-init';
import type { WaysDomainConfig } from './next-domains';
import type {
  WaysMaybePromise,
  WaysRouteParams,
  WaysServerRouteContext,
} from './next-route-params';
import type { WaysConfig } from './ways-config';

export {
  generateWaysMetadataBase as generateWaysMetadata,
  getWaysHtmlAttrsBase as getWaysHtmlAttrs,
  WAYS_LOCALE_COOKIE_NAME,
};
export type { WaysProps, WaysRootProps };
export type { WaysDomainConfig } from './next-domains';
export type { WaysRouteParams, WaysServerRouteContext } from './next-route-params';

export type WaysRootComponentProps = {
  children: React.ReactNode;
  params?: WaysMaybePromise<WaysRouteParams>;
};

export type WaysLocaleOptions = WaysServerRouteContext & {
  locale?: string;
};

export type WaysHtmlAttrsOptions = WaysLocaleOptions;

export type WaysMetadataOptions = WaysLocaleOptions;

export type WaysMetadataTranslator = (text: string) => string;
export type WaysMetadataFactory = (
  t: WaysMetadataTranslator
) => Record<string, any> | Promise<Record<string, any>>;
export type WaysMetadataInput = Record<string, any> | WaysMetadataFactory;

export type WaysRuntime = {
  WaysRoot: (props: WaysRootComponentProps) => Promise<React.JSX.Element>;
  htmlAttrs: (options?: WaysHtmlAttrsOptions) => Promise<Record<string, string>>;
  generateWaysMetadata: (
    metadata?: WaysMetadataInput,
    options?: WaysMetadataOptions
  ) => Promise<Record<string, any>>;
};

const resolveExplicitAcceptedLocales = (
  baseLocale: string,
  acceptedLocales?: string[]
): string[] | undefined => {
  if (!Array.isArray(acceptedLocales)) {
    return undefined;
  }

  return resolveAcceptedLocales(baseLocale, acceptedLocales);
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
  entries: string[];
  targetLocale: string;
  baseLocale: string;
  initOptions: WaysConfig;
}): Promise<Map<string, string>> => {
  const { entries, targetLocale, baseLocale, initOptions } = params;

  if (targetLocale === baseLocale) {
    return new Map();
  }

  const normalizedTexts = Array.from(
    new Set(entries.map((text) => text.trim()).filter((text) => text.length > 0))
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
      _requestInitDecorator: _composeRequestInitDecorators(
        createNextRequestInitDecorator(),
        initOptions._requestInitDecorator
      ),
    });

    const requests = normalizedTexts.map((text) => ({
      key: METADATA_TRANSLATION_CONTEXT_KEY,
      textHash: common.generateHashId([text, METADATA_TRANSLATION_CONTEXT_KEY]),
      baseLocale,
      targetLocale,
      text,
    }));

    const result = await common.fetchTranslations(requests, {
      origin: initOptions.requestOrigin,
    });
    if (!result.data.length) {
      return new Map();
    }

    const translatedBySource = new Map<string, string>();
    result.data.forEach((entry) => {
      const request = requests.find((candidate) => candidate.textHash === entry.textHash);
      if (!request) {
        return;
      }

      try {
        translatedBySource.set(
          request.text,
          crypto.decryptTranslationValue({
            encryptedText: entry.translation,
            sourceText: request.text,
            locale: targetLocale,
            key: METADATA_TRANSLATION_CONTEXT_KEY,
            textHash: entry.textHash,
          })
        );
      } catch {
        translatedBySource.set(request.text, request.text);
      }
    });

    return new Map(
      normalizedTexts.map((text) => [text, translatedBySource.get(text) ?? text] as const)
    );
  } catch {
    return new Map();
  }
};

const translateMetadataObject = async (params: {
  metadata: Record<string, any>;
  targetLocale: string;
  baseLocale: string;
  initOptions: WaysConfig;
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
    entries: entries.map((entry) => entry.value),
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
  initOptions: WaysConfig;
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
    entries: collectedTexts,
    targetLocale,
    baseLocale,
    initOptions,
  });

  if (!translationMap.size) {
    return firstPass;
  }

  return metadata((text) => translationMap.get(text) ?? text);
};

export const createWaysRuntime = (options: WaysConfig): WaysRuntime => {
  const {
    pathRouting,
    domains,
    localeParamName,
    router,
    routeManifest,
    requestOrigin,
    ...waysRootOptions
  } = options;
  const resolvedRouter =
    router === 'pages' || router === 'path' ? 'path' : router === 'none' ? 'none' : 'app';
  const resolvedPathRouting = resolvedRouter === 'app' ? pathRouting : undefined;
  const resolvedRouteManifest = resolvedRouter === 'app' ? routeManifest : undefined;
  const resolvedBaseLocale = recognizeLocale(waysRootOptions.baseLocale) || 'en-GB';
  const explicitAcceptedLocales = resolveExplicitAcceptedLocales(
    resolvedBaseLocale,
    waysRootOptions.acceptedLocales
  );
  const rootProps = {
    ...waysRootOptions,
    acceptedLocales: explicitAcceptedLocales,
  };
  const localeProps: Partial<
    Pick<WaysRootProps, 'locale' | 'baseLocale' | 'apiKey' | '_apiUrl' | 'acceptedLocales'>
  > & {
    origin?: string;
    pathRouting?: WaysConfig['pathRouting'];
    _requestInitDecorator?: WaysRootProps['_requestInitDecorator'];
    domains?: WaysDomainConfig[];
    localeParamName?: string;
  } = {
    locale: waysRootOptions.locale,
    baseLocale: waysRootOptions.baseLocale,
    apiKey: waysRootOptions.apiKey,
    _apiUrl: waysRootOptions._apiUrl,
    acceptedLocales: explicitAcceptedLocales,
    origin: requestOrigin,
    _requestInitDecorator: waysRootOptions._requestInitDecorator,
    pathRouting: resolvedPathRouting,
    domains,
    localeParamName,
  };

  const WaysRoot = async ({
    children,
    params,
  }: WaysRootComponentProps): Promise<React.JSX.Element> => {
    const rootPersistLocaleCookie =
      typeof waysRootOptions.persistLocaleCookie === 'boolean'
        ? waysRootOptions.persistLocaleCookie
        : undefined;

    return ServerWays({
      ...rootProps,
      origin: requestOrigin,
      router: resolvedRouter,
      pathRouting: resolvedPathRouting,
      children,
      persistLocaleCookie: rootPersistLocaleCookie,
      _persistLocaleCookiePolicy: waysRootOptions.persistLocaleCookie,
      domains,
      localeParamName,
      routeManifest: resolvedRouteManifest,
      params,
    });
  };

  const htmlAttrs = async (htmlOptions?: WaysHtmlAttrsOptions): Promise<Record<string, string>> => {
    return getWaysHtmlAttrsBase({
      ...localeProps,
      ...htmlOptions,
    });
  };

  const generateWaysMetadata = async (
    metadata?: WaysMetadataInput,
    metadataOptions?: WaysMetadataOptions
  ): Promise<Record<string, any>> => {
    const waysMetadata = await generateWaysMetadataBase({
      ...localeProps,
      ...metadataOptions,
      origin: metadataOptions?.origin,
    });

    if (!metadata) {
      return waysMetadata;
    }

    const resolvedLocale =
      (waysMetadata?.other && typeof waysMetadata.other['18ways_locale'] === 'string'
        ? waysMetadata.other['18ways_locale']
        : undefined) ||
      metadataOptions?.locale ||
      localeProps.locale ||
      localeProps.baseLocale ||
      'en-GB';
    const resolvedMetadataBaseLocale =
      localeProps.baseLocale || metadataOptions?.locale || localeProps.locale || resolvedLocale;
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
      baseLocale: resolvedMetadataBaseLocale,
      initOptions: {
        ...waysRootOptions,
        requestOrigin,
      },
    });

    return deepMerged(translatedMetadata, waysMetadata);
  };

  return {
    WaysRoot,
    htmlAttrs,
    generateWaysMetadata,
  };
};
