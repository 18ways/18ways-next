export const BASE_LOCALE = 'en-US';
export const ACCEPTED_LOCALES = ['en-US', 'en-US-x-caesar'] as const;

export type Locale = (typeof ACCEPTED_LOCALES)[number];

export const localeOptions: Array<{ value: Locale; label: string }> = [
  { value: BASE_LOCALE, label: 'English' },
  { value: 'en-US-x-caesar', label: 'Caesar Shift' },
];
