'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';
import type { WaysDomainConfig } from './next-domains';
import type { WaysRouteManifest, WaysRouterMode } from './ways-config';

type LocaleRuntimeConfig = {
  router?: WaysRouterMode;
  pathRouting?: WaysPathRoutingConfig;
  persistLocaleCookie?: boolean;
  domains?: WaysDomainConfig[];
  localeParamName?: string;
  routeManifest?: WaysRouteManifest;
};

const LocaleRuntimeConfigContext = createContext<LocaleRuntimeConfig>({});

export const LocaleRuntimeConfigProvider = ({
  router,
  pathRouting,
  persistLocaleCookie,
  domains,
  localeParamName,
  routeManifest,
  children,
}: LocaleRuntimeConfig & { children?: ReactNode }) => {
  return (
    <LocaleRuntimeConfigContext.Provider
      value={{
        router,
        pathRouting,
        persistLocaleCookie,
        domains,
        localeParamName,
        routeManifest,
      }}
    >
      {children}
    </LocaleRuntimeConfigContext.Provider>
  );
};

export const useWaysRouterMode = (): WaysRouterMode | undefined => {
  return useContext(LocaleRuntimeConfigContext).router;
};

export const useLocaleRuntimePathRouting = (): WaysPathRoutingConfig | undefined => {
  return useContext(LocaleRuntimeConfigContext).pathRouting;
};

export const useLocaleRuntimePersistLocaleCookie = (): boolean | undefined => {
  return useContext(LocaleRuntimeConfigContext).persistLocaleCookie;
};

export const useLocaleRuntimeDomains = (): WaysDomainConfig[] | undefined => {
  return useContext(LocaleRuntimeConfigContext).domains;
};

export const useLocaleRuntimeLocaleParamName = (): string | undefined => {
  return useContext(LocaleRuntimeConfigContext).localeParamName;
};

export const useLocaleRuntimeRouteManifest = (): WaysRouteManifest | undefined => {
  return useContext(LocaleRuntimeConfigContext).routeManifest;
};
