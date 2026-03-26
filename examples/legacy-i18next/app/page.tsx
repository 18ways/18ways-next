'use client';

import type { ChangeEvent } from 'react';
import { T, Ways } from '@18ways/react';
import { useTranslation } from 'react-i18next';
import { BASE_LOCALE, localeOptions, type Locale } from './i18n';

export default function Page() {
  const { t, i18n } = useTranslation('legacy');
  const locale = (i18n.resolvedLanguage || i18n.language || BASE_LOCALE) as Locale;

  const handleLocaleChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    await i18n.changeLanguage(event.target.value as Locale);
  };

  return (
    <main>
      <p>{t('badge')}</p>
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
      <label>
        {t('selectorLabel')}{' '}
        <select value={locale} onChange={handleLocaleChange}>
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p>{t('selectorHelp')}</p>
      <p>{t('legacyStatus', { locale })}</p>
      <p>{t('waysStatus', { locale })}</p>

      <h2>{t('legacyHeading')}</h2>
      <p>{t('legacyParagraph')}</p>
      <ul>
        <li>{t('legacyBulletOne')}</li>
        <li>{t('legacyBulletTwo')}</li>
        <li>{t('legacyBulletThree')}</li>
      </ul>

      <Ways context="modern-i18n-island" locale={locale}>
        <h2>
          <T>New 18ways widget</T>
        </h2>
        <p>
          <T>This subtree follows the locale chosen by the existing i18next selector.</T>
        </p>
        <p>
          <T>
            Keep the old i18next setup for existing screens and ship 18ways only where you need new
            translations.
          </T>
        </p>
      </Ways>

      <p>{t('footerNote')}</p>
    </main>
  );
}
