'use client';

import React from 'react';
import { Ways as ReactWays } from '@18ways/react';
import type { WaysRootProps } from '@18ways/react';
import { type WaysPathRoutingConfig } from '@18ways/core/i18n-shared';
import { _composeRequestInitDecorators, type _RequestInitDecorator } from '@18ways/core/common';
import { createNextRequestInitDecorator } from './next-request-init';
import { LocalePathSync } from './next-locale-sync';
import { LocaleRuntimeConfigProvider } from './next-locale-runtime';
import type { WaysDomainConfig } from './next-domains';
import type { WaysRouteManifest, WaysRouterMode } from './ways-config';

type NextReactWaysProps = Omit<WaysRootProps, '_requestInitDecorator'> & {
  _requestInitDecorator?: _RequestInitDecorator;
  pathRouting?: WaysPathRoutingConfig;
  domains?: WaysDomainConfig[];
  syncPathRouting?: boolean;
  router?: WaysRouterMode;
  localeParamName?: string;
  routeManifest?: WaysRouteManifest;
};

export const NextReactWays = (props: NextReactWaysProps): React.JSX.Element => {
  const {
    router,
    pathRouting,
    children,
    persistLocaleCookie,
    domains,
    syncPathRouting,
    localeParamName,
    routeManifest,
    ...reactWaysProps
  } = props;
  const requestInitDecorator = _composeRequestInitDecorators(
    createNextRequestInitDecorator(),
    props._requestInitDecorator
  );

  const waysTree = (
    <ReactWays
      {...reactWaysProps}
      persistLocaleCookie={persistLocaleCookie}
      _requestInitDecorator={requestInitDecorator}
    >
      {pathRouting && syncPathRouting !== false ? (
        <LocalePathSync pathRouting={pathRouting} />
      ) : null}
      {children}
    </ReactWays>
  );

  if (
    !router &&
    !pathRouting &&
    typeof persistLocaleCookie !== 'boolean' &&
    !domains?.length &&
    !routeManifest
  ) {
    return waysTree;
  }

  return (
    <LocaleRuntimeConfigProvider
      router={router}
      pathRouting={pathRouting}
      persistLocaleCookie={persistLocaleCookie}
      domains={domains}
      localeParamName={localeParamName}
      routeManifest={routeManifest}
    >
      {waysTree}
    </LocaleRuntimeConfigProvider>
  );
};
