import { T } from '@18ways/react';

interface HomeProps {
  locale: string;
  setLocale: (locale: string) => void;
}

export default function ClientHome({ locale, setLocale }: HomeProps) {
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    setLocale(newLocale);
    document.cookie = `18ways_locale=${newLocale}; path=/`;
  };

  return (
    <div id="app" data-testid="app">
      <div data-translation-key="hello.world">
        <T>Hello World</T>
      </div>
      <div data-translation-key="welcome.message">
        <T>Welcome</T>
      </div>
      <div data-translation-key="goodbye.message">
        <T>Goodbye</T>
      </div>
      <select data-testid="language-switcher" value={locale} onChange={handleLanguageChange}>
        <option data-locale="en-US" value="en-US">
          English
        </option>
        <option data-locale="ja-JP" value="ja-JP">
          日本語
        </option>
        <option data-locale="es-ES" value="es-ES">
          Español
        </option>
      </select>
    </div>
  );
}
