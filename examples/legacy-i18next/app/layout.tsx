import type { ReactNode } from 'react';
import { WaysRoot } from '@18ways/next/server';
import { LegacyI18nextProviders } from './LegacyI18nextProviders';
import { BASE_LOCALE } from './i18n';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BASE_LOCALE}>
      <body>
        <WaysRoot>
          <LegacyI18nextProviders>{children}</LegacyI18nextProviders>
        </WaysRoot>
      </body>
    </html>
  );
}
