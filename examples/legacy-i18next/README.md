# Legacy i18next Integration Example

This example shows a modular i18n integration for a Next.js app that already uses `i18next`.
It is intended as a practical example of adding a new i18n solution to a legacy i18n codebase
without rewriting the existing translation setup.

- `i18next` stays in charge of the language selector and legacy copy.
- The legacy copy lives in locale JSON files under `app/locales/`, the same way a traditional
  `i18next` app would normally keep it.
- `@18ways/next` is wired with `18ways.config.ts`, `withWays(...)`, and `WaysRoot`, matching the
  current Next setup.
- The nested `18ways` island receives the active `i18next` locale through its `locale` prop,
  which makes this a straightforward legacy i18n migration pattern for modular adoption.

The demo uses `pk_dummy_demo_token`, so the non-English locale is the synthetic
`en-US-x-caesar` language that ships with the 18ways demo mode. Replace that token with your real
API key when you want production locales.

Run it from this directory:

```bash
bun install
bun run dev
```
