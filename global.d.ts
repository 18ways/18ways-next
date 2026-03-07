import type { Translations } from '@18ways/core/common';

declare global {
  interface Window {
    __18WAYS_IN_MEMORY_TRANSLATIONS__?: Translations;
    __18WAYS_ACCEPTED_LOCALES__?: string[];
  }
}

export {};
