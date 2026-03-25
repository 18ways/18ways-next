const fs = require('node:fs');
const path = require('node:path');
const createJiti = require('jiti');

const WAYS_CONFIG_FILENAMES = [
  '18ways.config.ts',
  '18ways.config.mts',
  '18ways.config.cts',
  '18ways.config.js',
  '18ways.config.mjs',
  '18ways.config.cjs',
];

const resolveRealpath = (targetPath) => {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return targetPath;
  }
};

const findWaysConfigFile = (projectRoot) => {
  for (const filename of WAYS_CONFIG_FILENAMES) {
    const candidate = path.join(projectRoot, filename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
};

const normalizeLoadedConfig = (loadedConfig) => {
  if (loadedConfig && typeof loadedConfig === 'object' && 'default' in loadedConfig) {
    return loadedConfig.default;
  }

  return loadedConfig;
};

const loadWaysConfigFromProjectRoot = (projectRoot) => {
  const resolvedProjectRoot = resolveRealpath(projectRoot);
  const configFile = findWaysConfigFile(resolvedProjectRoot);
  if (!configFile) {
    throw new Error(
      `Missing 18ways entrypoint in ${resolvedProjectRoot}. Create one of: ${WAYS_CONFIG_FILENAMES.join(', ')}`
    );
  }

  const jiti = createJiti(path.join(resolvedProjectRoot, 'next.config.js'), {
    interopDefault: true,
    esmResolve: true,
  });
  const loadedConfig = normalizeLoadedConfig(jiti(configFile));
  if (!loadedConfig || typeof loadedConfig !== 'object') {
    throw new Error(`18ways entrypoint at ${configFile} must export a config object.`);
  }

  return {
    configFile,
    config: loadedConfig,
    projectRoot: resolvedProjectRoot,
  };
};

module.exports = {
  WAYS_CONFIG_FILENAMES,
  findWaysConfigFile,
  loadWaysConfigFromProjectRoot,
  resolveRealpath,
};
