import type { _RequestInitDecorator, _RequestInitLike } from '@18ways/core/common';

export const createNextRequestInitDecorator = (): _RequestInitDecorator => {
  return ({ method, requestInit, cacheTtlSeconds }): _RequestInitLike => {
    if (method !== 'GET' || cacheTtlSeconds <= 0) {
      return requestInit;
    }

    return {
      ...requestInit,
      next: {
        revalidate: cacheTtlSeconds,
      },
    };
  };
};
