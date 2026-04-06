import type { ResolvedTranslationStoreHydrationPayload } from '@18ways/core/common';

declare global {
  interface Window {
    __18WAYS_TRANSLATION_STORE__?: ResolvedTranslationStoreHydrationPayload;
  }
}

export {};
