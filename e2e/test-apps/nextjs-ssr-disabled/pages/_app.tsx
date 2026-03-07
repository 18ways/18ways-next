import { AppProps } from 'next/app';
import { Ways } from '@18ways/react';
import { useState } from 'react';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

function MyApp({ Component, pageProps }: AppProps) {
  const [locale, setLocale] = useState(() => {
    const savedLocale = getCookie('18ways-locale');
    return savedLocale || 'en-US';
  });

  return (
    <Ways
      apiKey="test-api-key"
      locale={locale}
      baseLocale="en-US"
      acceptedLocales={['en-US', 'ja-JP', 'es-ES']}
      context="app"
      fetcher={fetch}
      apiUrl={process.env.NEXT_PUBLIC_18WAYS_API_URL}
    >
      <Component {...pageProps} locale={locale} setLocale={setLocale} />
    </Ways>
  );
}

export default MyApp;
