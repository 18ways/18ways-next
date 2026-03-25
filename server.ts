import {
  createWaysRuntime,
  type WaysHtmlAttrsOptions,
  type WaysMetadataInput,
  type WaysMetadataOptions,
  type WaysRootComponentProps,
  type WaysRuntime,
} from './next';
import { getWaysLocale } from './rsc';
import type { WaysRouteParams, WaysServerRouteContext } from './next-route-params';
import type { WaysDomainConfig } from './next-domains';
import type { WaysConfig } from './ways-config';

export const init = (config: WaysConfig) => {
  let configuredRuntimePromise: Promise<WaysRuntime> | null = null;

  const getConfiguredWaysRuntime = async (): Promise<WaysRuntime> => {
    if (!configuredRuntimePromise) {
      configuredRuntimePromise = Promise.resolve(createWaysRuntime(config));
    }

    return configuredRuntimePromise;
  };

  return {
    WaysRoot: async (props: WaysRootComponentProps) => {
      return (await getConfiguredWaysRuntime()).WaysRoot(props);
    },
    htmlAttrs: async (options?: WaysHtmlAttrsOptions) => {
      return (await getConfiguredWaysRuntime()).htmlAttrs(options);
    },
    generateWaysMetadata: async (metadata?: WaysMetadataInput, options?: WaysMetadataOptions) => {
      return (await getConfiguredWaysRuntime()).generateWaysMetadata(metadata, options);
    },
    getLocale: async (options?: WaysServerRouteContext & { locale?: string }) => {
      return getWaysLocale({
        ...config,
        ...options,
      });
    },
  };
};

let implicitConfigPromise: Promise<WaysConfig> | null = null;
let implicitRuntimePromise: Promise<WaysRuntime> | null = null;

const loadImplicitConfig = async (): Promise<WaysConfig> => {
  if (!implicitConfigPromise) {
    implicitConfigPromise = import('@18ways/next/internal-config')
      .then((module: { config?: WaysConfig; default?: WaysConfig }) => {
        const loadedConfig = module.config || module.default;
        if (!loadedConfig || typeof loadedConfig !== 'object') {
          throw new Error(
            'Missing 18ways config. Create 18ways.config.ts and wrap next.config.js with withWays(...).'
          );
        }

        return loadedConfig as WaysConfig;
      })
      .catch((error) => {
        implicitConfigPromise = null;
        throw error;
      });
  }

  return implicitConfigPromise;
};

const loadImplicitRuntime = async (): Promise<WaysRuntime> => {
  if (!implicitRuntimePromise) {
    implicitRuntimePromise = loadImplicitConfig()
      .then((config) => Promise.resolve(createWaysRuntime(config)))
      .catch((error) => {
        implicitRuntimePromise = null;
        throw error;
      });
  }

  return implicitRuntimePromise;
};

export const WaysRoot = async (props: WaysRootComponentProps) => {
  return (await loadImplicitRuntime()).WaysRoot(props);
};

export const htmlAttrs = async (options?: WaysHtmlAttrsOptions) => {
  return (await loadImplicitRuntime()).htmlAttrs(options);
};

export const generateWaysMetadata = async (
  metadata?: WaysMetadataInput,
  options?: WaysMetadataOptions
) => {
  return (await loadImplicitRuntime()).generateWaysMetadata(metadata, options);
};

export const getLocale = async (options?: WaysServerRouteContext & { locale?: string }) => {
  const config = await loadImplicitConfig();

  return getWaysLocale({
    ...config,
    ...options,
  });
};

export type {
  WaysRootComponentProps,
  WaysHtmlAttrsOptions,
  WaysMetadataInput,
  WaysMetadataOptions,
  WaysRouteParams,
  WaysServerRouteContext,
  WaysDomainConfig,
};
