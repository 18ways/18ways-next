import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import { localizePathname } from '../next-client';

describe('next-client pathname localization', () => {
  it('replaces the current locale prefix when switching locales', () => {
    expect(
      localizePathname('/en-GB/docs/getting-started', 'ja-JP', {
        acceptedLocales: ['en-GB', 'ja-JP'],
        currentLocale: 'en-GB',
      })
    ).toBe('/ja-JP/docs/getting-started');
  });

  it('does not duplicate the target locale prefix when locale state is stale', () => {
    expect(
      localizePathname('/ja-JP', 'ja-JP', {
        acceptedLocales: ['en-GB'],
        currentLocale: 'en-GB',
      })
    ).toBe('/ja-JP');
  });

  it('preserves non-locale path segments', () => {
    expect(
      localizePathname('/japan/travel', 'ja-JP', {
        acceptedLocales: ['en-GB'],
        currentLocale: 'en-GB',
      })
    ).toBe('/ja-JP/japan/travel');
  });

  it('keeps dashboard routes unlocalized when path routing is disabled', () => {
    expect(
      localizePathname('/dashboard/organizations', 'ja-JP', {
        acceptedLocales: ['en-GB', 'ja-JP'],
        currentLocale: 'en-GB',
        pathRouting: {
          exclude: ['/dashboard'],
        },
      })
    ).toBe('/dashboard/organizations');
  });

  it('keeps dashboard routes unlocalized by default', () => {
    expect(
      localizePathname('/dashboard/organizations', 'ja-JP', {
        acceptedLocales: ['en-GB', 'ja-JP'],
        currentLocale: 'en-GB',
      })
    ).toBe('/dashboard/organizations');
  });
});
