import { AppProps, AppContext } from 'next/app';
import { Ways } from '@18ways/react';
import { useState } from 'react';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

function parseCookieHeader(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (cookie) {
    return cookie.substring(name.length + 1);
  }
  return null;
}

interface MyAppProps extends AppProps {
  initialLocale?: string;
}

function MyApp({ Component, pageProps, initialLocale }: MyAppProps) {
  const [locale, setLocale] = useState(initialLocale || 'en-US');

  return (
    <Ways
      apiKey="test-api-key"
      locale={locale}
      baseLocale="en-US"
      acceptedLocales={['en-US', 'ja-JP', 'es-ES']}
      context="app"
      fetcher={fetch}
      _apiUrl={process.env.NEXT_PUBLIC_18WAYS_API_URL}
    >
      <Component {...pageProps} locale={locale} setLocale={setLocale} />
    </Ways>
  );
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  const { ctx } = appContext;
  const cookieHeader = ctx.req?.headers.cookie;
  const initialLocale = parseCookieHeader(cookieHeader, '18ways_locale') || 'en-US';

  return {
    initialLocale,
  };
};

export default MyApp;
