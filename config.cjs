const fs = require('node:fs');
const path = require('node:path');
const createJiti = require('jiti');

const builtConfigPath = path.join(__dirname, 'dist', 'config.cjs');
const workspaceCorePath = path.resolve(__dirname, '..', '18ways-core');
const isWorkspaceSourceTree =
  fs.existsSync(workspaceCorePath) && fs.statSync(workspaceCorePath).isDirectory();

if (!isWorkspaceSourceTree && fs.existsSync(builtConfigPath)) {
  module.exports = require(builtConfigPath);
} else {
  const jiti = createJiti(__filename, {
    interopDefault: false,
    esmResolve: true,
    alias: isWorkspaceSourceTree
      ? {
          '@18ways/core': path.join(workspaceCorePath, 'index.ts'),
          '@18ways/core/': `${workspaceCorePath}/`,
        }
      : undefined,
  });

  module.exports = jiti('./config.ts');
}
