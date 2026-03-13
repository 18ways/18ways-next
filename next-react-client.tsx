'use client';

import React from 'react';
import { Ways as ReactWays } from '@18ways/react';
import type { WaysRootProps } from '@18ways/react';
import { _composeRequestInitDecorators, type _RequestInitDecorator } from '@18ways/core/common';
import { createNextRequestInitDecorator } from './next-request-init';

type NextReactWaysProps = Omit<WaysRootProps, '_requestInitDecorator'> & {
  _requestInitDecorator?: _RequestInitDecorator;
};

export const NextReactWays = (props: NextReactWaysProps): React.JSX.Element => {
  const requestInitDecorator = _composeRequestInitDecorators(
    createNextRequestInitDecorator(),
    props._requestInitDecorator
  );

  return <ReactWays {...props} _requestInitDecorator={requestInitDecorator} />;
};
