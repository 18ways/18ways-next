const fs = require('node:fs');
const path = require('node:path');
const { loadWaysConfigFromProjectRoot, resolveRealpath } = require('./config-loader.cjs');

const resolveProjectRoot = () => {
  const callerFilename =
    module.parent && module.parent.filename ? module.parent.filename : process.cwd();
  const callerPath =
    fs.existsSync(callerFilename) && fs.statSync(callerFilename).isFile()
      ? path.dirname(callerFilename)
      : callerFilename;
  return resolveRealpath(callerPath);
};

const canonicalizeLocale = (locale) => {
  const trimmed = typeof locale === 'string' ? locale.trim() : '';
  if (!trimmed) {
    return '';
  }

  try {
    return Intl.getCanonicalLocales(trimmed)[0] || trimmed;
  } catch {
    return trimmed;
  }
};

const recognizeLocale = (value) => {
  const canonical = canonicalizeLocale(value || '');
  return canonical || null;
};

const normalizePathname = (pathname) => {
  if (!pathname) return '/';
  if (!pathname.startsWith('/')) return `/${pathname}`;
  return pathname;
};

const normalizeAcceptedLocaleList = (locales) =>
  Array.from(new Set(locales.map((locale) => canonicalizeLocale(locale || '')).filter(Boolean)));

const ensureBaseLocaleAccepted = (baseLocale, locales) => {
  const normalizedBaseLocale = baseLocale ? canonicalizeLocale(baseLocale) : '';

  if (!normalizedBaseLocale) {
    return locales;
  }

  return [normalizedBaseLocale, ...normalizedAcceptedLocaleList(locales, normalizedBaseLocale)];
};

const normalizedAcceptedLocaleList = (locales, baseLocale) =>
  normalizeAcceptedLocaleList(locales).filter((locale) => locale !== baseLocale);

const resolveAcceptedLocales = (baseLocale, ...localeSources) =>
  ensureBaseLocaleAccepted(
    baseLocale,
    localeSources.flatMap((locales) => locales || [])
  );

const PAGE_FILE_RE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const ROUTE_FILE_RE = /^route\.(tsx|ts|jsx|js)$/;
const SPECIAL_ROUTE_FILE_RE =
  /^(favicon\.ico|robots\.ts|sitemap\.ts|opengraph-image\.(tsx|ts|jsx|js)|twitter-image\.(tsx|ts|jsx|js))$/;

const isRouteGroup = (segment) => segment.startsWith('(') && segment.endsWith(')');
const isParallelRoute = (segment) => segment.startsWith('@');
const isPrivateSegment = (segment) => segment.startsWith('_') && !segment.startsWith('__');

const normalizeRoutePattern = (segments) => {
  if (!segments.length) {
    return '/';
  }

  return normalizePathname(`/${segments.join('/')}`);
};

const patternToGlob = (pattern) =>
  pattern
    .replace(/\[\[\.\.\.[^/]+\]\]/g, '*')
    .replace(/\[\.\.\.[^/]+\]/g, '*')
    .replace(/\[[^/]+\]/g, '*');

const unique = (values) => Array.from(new Set(values));

const findAppDir = (projectRoot) => {
  const candidateDirs = [path.join(projectRoot, 'src', 'app'), path.join(projectRoot, 'app')];

  for (const candidate of candidateDirs) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
};

const scanAppRoutes = (dir, localeParamName, state) => {
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
      routeSegments.push(entry.name.replace(/\.(tsx|ts|jsx|js)$/, ''));
    }

    const pattern = normalizeRoutePattern(routeSegments);
    if (state.localized) {
      state.localizedPatterns.push(pattern);
    } else {
      state.unlocalizedPatterns.push(pattern);
    }
  }
};

const buildRouteManifest = (projectRoot, localeParamName) => {
  const appDir = findAppDir(projectRoot);
  if (!appDir) {
    return {
      localized: [],
      unlocalized: [],
      ambiguous: [],
    };
  }

  const localizedPatterns = [];
  const unlocalizedPatterns = [];

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

const buildAppPathRouting = (manifest) => {
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

const resolveRouterMode = (router) => {
  if (router === 'pages' || router === 'path') {
    return 'path';
  }

  if (router === 'none') {
    return 'none';
  }

  return 'app';
};

const toSerializablePublicConfig = (options, projectRoot, includeRouteManifest = true) => {
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

const buildPagesI18nConfig = (config) => {
  const acceptedLocales = config.acceptedLocales;
  if (!acceptedLocales || !acceptedLocales.length) {
    throw new Error('18ways path router config requires `acceptedLocales`.');
  }

  return {
    locales: acceptedLocales,
    defaultLocale: config.baseLocale,
    domains: config.domains,
    localeDetection: false,
  };
};

const INTERNAL_CONFIG_ALIAS = '@18ways/next/internal-config';

const looksLikeWaysConfig = (value) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('apiKey' in value ||
      'baseLocale' in value ||
      'router' in value ||
      'localeParamName' in value ||
      'acceptedLocales' in value)
  );

const withWays = (nextConfigOrOptions = {}, explicitOptions) => {
  const options =
    explicitOptions || (looksLikeWaysConfig(nextConfigOrOptions) ? nextConfigOrOptions : undefined);
  const nextConfig =
    explicitOptions || looksLikeWaysConfig(nextConfigOrOptions) ? {} : nextConfigOrOptions;
  const projectRoot = resolveProjectRoot();
  const loadedConfig = options ? null : loadWaysConfigFromProjectRoot(projectRoot);
  const resolvedConfig = options || (loadedConfig && loadedConfig.config);
  const resolvedProjectRoot = (loadedConfig && loadedConfig.projectRoot) || projectRoot;
  if (!resolvedConfig) {
    return nextConfig;
  }

  const publicConfig = toSerializablePublicConfig(resolvedConfig, resolvedProjectRoot, false);
  const configAliasPath = loadedConfig && loadedConfig.configFile;
  const needsAliasInjection = Boolean(configAliasPath);

  const wrappedWebpack = (config, options) => {
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
      ...((nextConfig.turbopack && nextConfig.turbopack.resolveAlias) || {}),
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

module.exports = {
  withWays,
};
