import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withWays } from '../config';

const originalCwd = process.cwd();
const createdDirs: string[] = [];
const requireFromTest = createRequire(import.meta.url);

const createTempProject = (): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '18ways-next-'));
  createdDirs.push(tempDir);
  return tempDir;
};

const writeFile = (
  filePath: string,
  contents = 'export default function Page() { return null; }\n'
) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
};

afterEach(() => {
  process.chdir(originalCwd);

  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('withWays', () => {
  it('returns an empty fragment for app-router config', () => {
    const projectRoot = createTempProject();
    process.chdir(projectRoot);

    const fragment = withWays(
      {},
      {
        apiKey: 'pk_test_generated',
        baseLocale: 'en-GB',
        router: 'app',
        localeParamName: 'lang',
        persistLocaleCookie: false,
      }
    );

    expect(fragment).toEqual({});
  });

  it('returns path-router i18n config', () => {
    const projectRoot = createTempProject();
    process.chdir(projectRoot);

    const fragment = withWays(
      {},
      {
        apiKey: 'pk_test_generated',
        baseLocale: 'en-GB',
        router: 'path',
        acceptedLocales: ['en-GB', 'fr-FR'],
        domains: [
          { domain: 'example.com', defaultLocale: 'en-GB' },
          { domain: 'example.fr', defaultLocale: 'fr-FR', locales: ['fr-FR'] },
        ],
      }
    );

    expect(fragment).toEqual({
      i18n: {
        locales: ['en-GB', 'fr-FR'],
        defaultLocale: 'en-GB',
        domains: [
          { domain: 'example.com', defaultLocale: 'en-GB' },
          { domain: 'example.fr', defaultLocale: 'fr-FR', locales: ['fr-FR'] },
        ],
        localeDetection: false,
      },
    });
  });

  it('loads withWays from the CommonJS shim in the source workspace', () => {
    const projectRoot = createTempProject();
    process.chdir(projectRoot);

    const { withWays: withWaysFromCjs } = requireFromTest('../config.cjs') as {
      withWays: typeof withWays;
    };
    const fragment = withWaysFromCjs(
      {},
      {
        apiKey: 'pk_test_generated',
        baseLocale: 'en-GB',
        router: 'path',
        acceptedLocales: ['en-GB', 'fr-FR'],
      }
    );

    expect(fragment).toEqual({
      i18n: {
        locales: ['en-GB', 'fr-FR'],
        defaultLocale: 'en-GB',
        domains: undefined,
        localeDetection: false,
      },
    });
  });

  it('returns an empty fragment for router none', () => {
    const projectRoot = createTempProject();
    process.chdir(projectRoot);

    const fragment = withWays(
      {},
      {
        apiKey: 'pk_test_generated',
        baseLocale: 'en-GB',
        router: 'none',
      }
    );

    expect(fragment).toEqual({});
  });

  it('loads 18ways.config.ts when withWays is called without explicit options', () => {
    const projectRoot = createTempProject();
    process.chdir(projectRoot);

    writeFile(
      path.join(projectRoot, '18ways.config.ts'),
      [
        'export default {',
        "  apiKey: 'pk_test_generated',",
        "  baseLocale: 'en-GB',",
        "  router: 'path',",
        "  acceptedLocales: ['en-GB', 'fr-FR'],",
        '};',
        '',
      ].join('\n')
    );

    const fragment = withWays();
    const generatedInternalConfigPath = fs.realpathSync(
      path.join(projectRoot, '.18ways', 'internal-config.ts')
    );

    expect(fragment.i18n).toEqual({
      locales: ['en-GB', 'fr-FR'],
      defaultLocale: 'en-GB',
      domains: undefined,
      localeDetection: false,
    });
    expect(typeof fragment.webpack).toBe('function');
    expect(fragment.turbopack?.resolveAlias?.['@18ways/next/internal-config']).toBe(
      generatedInternalConfigPath
    );
    expect(fs.readFileSync(generatedInternalConfigPath, 'utf8')).toContain('../18ways.config.ts');
  });

  it('generates an internal config wrapper with derived app-router path routing', () => {
    const projectRoot = createTempProject();
    process.chdir(projectRoot);

    writeFile(
      path.join(projectRoot, '18ways.config.ts'),
      [
        'export default {',
        "  apiKey: 'pk_test_generated',",
        "  baseLocale: 'en-GB',",
        "  router: 'app',",
        '};',
        '',
      ].join('\n')
    );
    writeFile(path.join(projectRoot, 'src/app/[lang]/page.tsx'));
    writeFile(path.join(projectRoot, 'src/app/dashboard/page.tsx'));
    writeFile(path.join(projectRoot, 'src/app/__design/page.tsx'));

    const fragment = withWays();
    const generatedInternalConfigPath = fs.realpathSync(
      path.join(projectRoot, '.18ways', 'internal-config.ts')
    );
    const generatedInternalConfig = fs.readFileSync(generatedInternalConfigPath, 'utf8');

    expect(fragment.turbopack?.resolveAlias?.['@18ways/next/internal-config']).toBe(
      generatedInternalConfigPath
    );
    expect(generatedInternalConfig).toContain('"router": "app"');
    expect(generatedInternalConfig).toContain('"pathRouting"');
    expect(generatedInternalConfig).toContain('"/dashboard"');
    expect(generatedInternalConfig).toContain('"/__design"');
    expect(generatedInternalConfig).toContain('"routeManifest"');
  });
});
