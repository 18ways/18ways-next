![18ways logo](https://18ways.com/18w-light.svg)

# @18ways/next

18ways makes i18n easy. SEO-ready, AI-powered translations for modern products.

`@18ways/next` is the Next.js adapter for 18ways. It connects locale-aware routing and server rendering to the 18ways runtime.

## Install

```bash
npm install @18ways/next @18ways/react
```

## Basic translation

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import { init as initWays } from '@18ways/next/server';

const { WaysRoot } = initWays({
  apiKey: 'pk_live_GET_ME_FROM_YOUR_DASHBOARD_...',
  baseLocale: 'en-GB',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <WaysRoot>{children}</WaysRoot>
      </body>
    </html>
  );
}

// app/page.tsx
('use client');

import { LanguageSwitcher, Ways, T } from '@18ways/react';
import { useLocale } from '@18ways/next/client';

export default function Page() {
  const { locale, setLocale } = useLocale();

  return (
    <>
      <LanguageSwitcher
        currentLocale={locale}
        onLocaleChange={(nextLocale) => setLocale(nextLocale)}
      />
      <Ways context="checkout.button">
        <T>Pay now</T>
      </Ways>
    </>
  );
}
```

Docs: [18ways.com/docs](https://18ways.com/docs)
