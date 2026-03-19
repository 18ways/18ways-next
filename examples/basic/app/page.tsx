'use client';

import { LanguageSwitcher, T } from '@18ways/react';
import { useLocale } from '@18ways/next/client';

export default function Page() {
  const { locale, setLocale } = useLocale();

  return (
    <main className="next-demo-shell">
      <section className="next-demo-card">
        <p className="next-demo-eyebrow">@18ways/next</p>
        <h1 className="next-demo-title">
          <T>Hello world</T>
        </h1>
        <p className="next-demo-copy">
          <T>Keep locale setup on the server and interactive text in the client.</T>
        </p>
      </section>
      <div className="next-demo-switcher">
        <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
      </div>
    </main>
  );
}
