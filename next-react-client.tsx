'use client';

import React from 'react';
import { Ways as ReactWays } from '@18ways/react';
import type { WaysRootProps } from '@18ways/react';
import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';
import { _composeRequestInitDecorators, type _RequestInitDecorator } from '@18ways/core/common';
import { createNextRequestInitDecorator } from './next-request-init';
import { LocalePathSync } from './next-locale-sync';
import { LocaleRuntimeConfigProvider } from './next-locale-runtime';

type NextReactWaysProps = Omit<WaysRootProps, '_requestInitDecorator'> & {
  _requestInitDecorator?: _RequestInitDecorator;
  pathRouting?: WaysPathRoutingConfig;
};

export const NextReactWays = (props: NextReactWaysProps): React.JSX.Element => {
  const { pathRouting, children, persistLocaleCookie, ...reactWaysProps } = props;
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
      {pathRouting ? <LocalePathSync pathRouting={pathRouting} /> : null}
      {children}
    </ReactWays>
  );

  if (!pathRouting && typeof persistLocaleCookie !== 'boolean') {
    return waysTree;
  }

  return (
    <LocaleRuntimeConfigProvider
      pathRouting={pathRouting}
      persistLocaleCookie={persistLocaleCookie}
    >
      {waysTree}
    </LocaleRuntimeConfigProvider>
  );
};
