![18ways logo](https://18ways.com/18w-light.svg)

# @18ways/next

18ways makes i18n easy. SEO-ready, AI-powered translations for modern products.

`@18ways/next` is the Next.js adapter for 18ways. It connects locale-aware routing and server rendering to the 18ways runtime.

## Install

```bash
npm install @18ways/next @18ways/react
```

## Basic translation

Use this example exactly as written to test the library locally. `pk_dummy_demo_token` enables the built-in demo mode with the `Caesar Shift` language.

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';
import { init as initWays } from '@18ways/next/server';

// This should be called in a server component.
const { WaysRoot } = initWays({
  apiKey: 'pk_dummy_demo_token',
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
```

```tsx
// app/page.tsx
'use client';

import { LanguageSwitcher, T } from '@18ways/react';
import { useLocale } from '@18ways/next/client';

export default function Page() {
  const { locale, setLocale } = useLocale();

  return (
    <>
      <LanguageSwitcher
        currentLocale={locale}
        onLocaleChange={(nextLocale) => setLocale(nextLocale)}
      />
      <T>Hello world</T>
    </>
  );
}
```

For a lightweight client-only demo app, see `examples/basic/`. The example keeps a note showing where `initWays(...)` should be called in a server component.

Docs: [18ways.com/docs](https://18ways.com/docs)
