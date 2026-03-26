'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createLegacyI18nInstance } from './legacy-i18next-instance';
import { BASE_LOCALE } from './i18n';

export function LegacyI18nextProviders({ children }: { children: ReactNode }) {
  const [i18n] = useState(() => createLegacyI18nInstance(BASE_LOCALE));

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
