'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';

type LocaleRuntimeConfig = {
  pathRouting?: WaysPathRoutingConfig;
};

const LocaleRuntimeConfigContext = createContext<LocaleRuntimeConfig>({});

export const LocaleRuntimeConfigProvider = ({
  pathRouting,
  children,
}: LocaleRuntimeConfig & { children?: ReactNode }) => {
  return (
    <LocaleRuntimeConfigContext.Provider value={{ pathRouting }}>
      {children}
    </LocaleRuntimeConfigContext.Provider>
  );
};

export const useLocaleRuntimePathRouting = (): WaysPathRoutingConfig | undefined => {
  return useContext(LocaleRuntimeConfigContext).pathRouting;
};
