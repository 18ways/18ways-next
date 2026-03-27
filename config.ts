import fs from 'node:fs';
import path from 'node:path';
import {
  normalizePathname,
  recognizeLocale,
  type WaysPathRoutingConfig,
} from '@18ways/core/i18n-shared';
import { resolveAcceptedLocales } from '@18ways/core/common';
import * as configLoader from './config-loader.cjs';
import type { WaysDomainConfig } from './next-domains';
import { type WaysConfig, type WaysPublicConfig, type WaysRouteManifest } from './ways-config';

type NextConfigFragment = {
  webpack?: (config: any, options: any) => any;
  turbopack?: {
    resolveAlias?: Record<string, any>;
  };
  i18n?: {
    locales: string[];
    defaultLocale: string;
    domains?: WaysDomainConfig[];
    localeDetection?: boolean;
  };
  [key: string]: any;
};

const INTERNAL_CONFIG_ALIAS = '@18ways/next/internal-config';
const GENERATED_INTERNAL_CONFIG_DIR = '.18ways';
const GENERATED_INTERNAL_CONFIG_FILENAME = 'internal-config.ts';

const looksLikeWaysConfig = (value: unknown): value is WaysConfig => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ('apiKey' in value ||
        'baseLocale' in value ||
        'router' in value ||
        'localeParamName' in value ||
        'acceptedLocales' in value)
  );
};

const PAGE_FILE_RE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const ROUTE_FILE_RE = /^route\.(tsx|ts|jsx|js)$/;
const SPECIAL_ROUTE_FILE_RE =
  /^(favicon\.ico|robots\.ts|sitemap\.ts|opengraph-image\.(tsx|ts|jsx|js)|twitter-image\.(tsx|ts|jsx|js))$/;

const isRouteGroup = (segment: string): boolean => segment.startsWith('(') && segment.endsWith(')');
const isParallelRoute = (segment: string): boolean => segment.startsWith('@');
const isPrivateSegment = (segment: string): boolean =>
  segment.startsWith('_') && !segment.startsWith('__');

const normalizeRoutePattern = (segments: string[]): string => {
  if (!segments.length) {
    return '/';
  }

  return normalizePathname(`/${segments.join('/')}`);
};

const patternToGlob = (pattern: string): string => {
  return pattern
    .replace(/\[\[\.\.\.[^/]+\]\]/g, '*')
    .replace(/\[\.\.\.[^/]+\]/g, '*')
    .replace(/\[[^/]+\]/g, '*');
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const findAppDir = (projectRoot: string): string | null => {
  const candidateDirs = [path.join(projectRoot, 'src', 'app'), path.join(projectRoot, 'app')];

  for (const candidate of candidateDirs) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
};

const scanAppRoutes = (
  dir: string,
  localeParamName: string,
  state: {
    segments: string[];
    localized: boolean;
    localizedPatterns: string[];
    unlocalizedPatterns: string[];
  }
): void => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isParallelRoute(entry.name) || isPrivateSegment(entry.name)) {
        continue;
      }

      const nextSegments = state.segments.slice();
      let nextLocalized = state.localized;

      if (!isRouteGroup(entry.name)) {
        if (entry.name === `[${localeParamName}]`) {
          nextLocalized = true;
        } else {
          nextSegments.push(entry.name);
        }
      }

      scanAppRoutes(path.join(dir, entry.name), localeParamName, {
        ...state,
        segments: nextSegments,
        localized: nextLocalized,
      });
      continue;
    }

    const matchesPage = PAGE_FILE_RE.test(entry.name);
    const matchesRoute = ROUTE_FILE_RE.test(entry.name);
    const matchesSpecialRoute = SPECIAL_ROUTE_FILE_RE.test(entry.name);

    if (!matchesPage && !matchesRoute && !matchesSpecialRoute) {
      continue;
    }

    const routeSegments = state.segments.slice();
    if (matchesSpecialRoute) {
      const specialRouteName = entry.name.replace(/\.(tsx|ts|jsx|js)$/, '');
      routeSegments.push(specialRouteName);
    }

    const pattern = normalizeRoutePattern(routeSegments);
    if (state.localized) {
      state.localizedPatterns.push(pattern);
    } else {
      state.unlocalizedPatterns.push(pattern);
    }
  }
};

const buildRouteManifest = (projectRoot: string, localeParamName: string): WaysRouteManifest => {
  const appDir = findAppDir(projectRoot);
  if (!appDir) {
    return {
      localized: [],
      unlocalized: [],
      ambiguous: [],
    };
  }

  const localizedPatterns: string[] = [];
  const unlocalizedPatterns: string[] = [];

  scanAppRoutes(appDir, localeParamName, {
    segments: [],
    localized: false,
    localizedPatterns,
    unlocalizedPatterns,
  });

  const localized = unique(localizedPatterns).sort();
  const unlocalized = unique(unlocalizedPatterns).sort();
  const localizedSet = new Set(localized);
  const ambiguous = unlocalized.filter((pattern) => localizedSet.has(pattern));

  return {
    localized,
    unlocalized,
    ambiguous,
  };
};

const buildAppPathRouting = (manifest: WaysRouteManifest): WaysPathRoutingConfig | undefined => {
  const ambiguous = new Set(manifest.ambiguous);
  const exclude = manifest.unlocalized
    .filter((pattern) => !ambiguous.has(pattern))
    .map((pattern) => patternToGlob(pattern));

  if (!exclude.length) {
    return undefined;
  }

  return {
    exclude: unique(exclude),
  };
};

const resolveRouterMode = (router: WaysConfig['router']): 'app' | 'path' | 'none' => {
  if (router === 'pages' || router === 'path') {
    return 'path';
  }

  if (router === 'none') {
    return 'none';
  }

  return 'app';
};

const toSerializablePublicConfig = (
  options: WaysConfig,
  projectRoot: string,
  includeRouteManifest = true
): WaysPublicConfig => {
  const router = resolveRouterMode(options.router);
  const baseLocale = recognizeLocale(options.baseLocale) || 'en-GB';
  const localeParamName = options.localeParamName || 'lang';
  const acceptedLocales = Array.isArray(options.acceptedLocales)
    ? resolveAcceptedLocales(baseLocale, options.acceptedLocales)
    : undefined;
  const routeManifest =
    router === 'app' && includeRouteManifest
      ? buildRouteManifest(projectRoot, localeParamName)
      : options.routeManifest;
  const pathRouting =
    router === 'app'
      ? routeManifest
        ? buildAppPathRouting(routeManifest)
        : options.pathRouting
      : undefined;

  return {
    apiKey: options.apiKey,
    baseLocale,
    router,
    acceptedLocales,
    domains: options.domains,
    localeParamName,
    cacheTtl: options.cacheTtl,
    messageFormatter: options.messageFormatter,
    serverInitialTranslationTimeoutMs: options.serverInitialTranslationTimeoutMs,
    _apiUrl: options._apiUrl,
    persistLocaleCookie:
      typeof options.persistLocaleCookie === 'boolean' ? options.persistLocaleCookie : undefined,
    pathRouting,
    routeManifest,
  };
};

const buildPagesI18nConfig = (config: WaysPublicConfig): NextConfigFragment['i18n'] => {
  const acceptedLocales = config.acceptedLocales;
  if (!acceptedLocales?.length) {
    throw new Error('18ways path router config requires `acceptedLocales`.');
  }

  return {
    locales: acceptedLocales,
    defaultLocale: config.baseLocale,
    domains: config.domains,
    localeDetection: false,
  };
};

const toRelativeImportPath = (fromDir: string, targetFile: string): string => {
  const relativePath = path.relative(fromDir, targetFile).replace(/\\/g, '/');
  if (!relativePath) {
    return './';
  }

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const buildGeneratedInternalConfigSource = (
  relativeConfigPath: string,
  publicConfig: WaysPublicConfig
): string => {
  return [
    `import * as loadedConfigModule from ${JSON.stringify(relativeConfigPath)};`,
    '',
    "const rawConfig = 'default' in loadedConfigModule ? loadedConfigModule.default : loadedConfigModule;",
    `const derivedConfig = ${JSON.stringify(publicConfig, null, 2)};`,
    '',
    'export const config = {',
    '  ...rawConfig,',
    '  ...derivedConfig,',
    '};',
    '',
    'export default config;',
    '',
  ].join('\n');
};

const ensureGeneratedInternalConfig = (
  projectRoot: string,
  configFile: string,
  publicConfig: WaysPublicConfig
): string => {
  const generatedDir = path.join(projectRoot, GENERATED_INTERNAL_CONFIG_DIR);
  const generatedFile = path.join(generatedDir, GENERATED_INTERNAL_CONFIG_FILENAME);
  const nextContents = buildGeneratedInternalConfigSource(
    toRelativeImportPath(generatedDir, configFile),
    publicConfig
  );

  fs.mkdirSync(generatedDir, { recursive: true });
  if (!fs.existsSync(generatedFile) || fs.readFileSync(generatedFile, 'utf8') !== nextContents) {
    fs.writeFileSync(generatedFile, nextContents, 'utf8');
  }

  return generatedFile;
};

export const withWays = (
  nextConfigOrOptions: NextConfigFragment | WaysConfig = {},
  explicitOptions?: WaysConfig
): NextConfigFragment => {
  const options =
    explicitOptions || (looksLikeWaysConfig(nextConfigOrOptions) ? nextConfigOrOptions : undefined);
  const nextConfig =
    explicitOptions || looksLikeWaysConfig(nextConfigOrOptions) ? {} : nextConfigOrOptions;
  const projectRoot = process.cwd();
  const loadedConfig = options ? null : configLoader.loadWaysConfigFromProjectRoot(projectRoot);
  const resolvedConfig = options || loadedConfig?.config;
  const resolvedProjectRoot = loadedConfig?.projectRoot || projectRoot;
  if (!resolvedConfig) {
    return nextConfig;
  }

  const publicConfig = toSerializablePublicConfig(resolvedConfig, resolvedProjectRoot, true);
  const configAliasPath = loadedConfig?.configFile
    ? ensureGeneratedInternalConfig(resolvedProjectRoot, loadedConfig.configFile, publicConfig)
    : undefined;
  const needsAliasInjection = Boolean(configAliasPath);

  const wrappedWebpack = (config: any, options: any) => {
    const nextWebpackConfig =
      typeof nextConfig.webpack === 'function' ? nextConfig.webpack(config, options) : config;

    nextWebpackConfig.resolve = nextWebpackConfig.resolve || {};
    nextWebpackConfig.resolve.alias = {
      ...(nextWebpackConfig.resolve.alias || {}),
      ...(configAliasPath ? { [INTERNAL_CONFIG_ALIAS]: configAliasPath } : {}),
    };

    return nextWebpackConfig;
  };

  const wrappedTurbopack = {
    ...(nextConfig.turbopack || {}),
    resolveAlias: {
      ...(nextConfig.turbopack?.resolveAlias || {}),
      ...(configAliasPath ? { [INTERNAL_CONFIG_ALIAS]: configAliasPath } : {}),
    },
  };

  if (publicConfig.router === 'path') {
    return {
      ...nextConfig,
      i18n: buildPagesI18nConfig(publicConfig),
      ...(needsAliasInjection ? { webpack: wrappedWebpack, turbopack: wrappedTurbopack } : {}),
    };
  }

  return {
    ...nextConfig,
    ...(needsAliasInjection ? { webpack: wrappedWebpack, turbopack: wrappedTurbopack } : {}),
  };
};

export type { WaysConfig, WaysPublicConfig, WaysRouteManifest } from './ways-config';
