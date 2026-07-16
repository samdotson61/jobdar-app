// Phase 9.0: pnpm-workspace Metro config so the app bundles @jobfaro/engine (the real lib/ engine) which
// lives outside the app dir. Standard Expo monorepo setup: watch the workspace root + resolve its
// node_modules (where pnpm symlinks @jobfaro/engine → packages/engine → re-exports ../../lib).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
if (!config.resolver.sourceExts.includes('mjs')) config.resolver.sourceExts.push('mjs');

// Phase 10: the engine now exports the scanner providers; iCIMS has an OPT-IN `--playwright` render
// fallback behind a lazy import that only the CLI can use. Metro still tries to bundle the specifier —
// stub it to an empty module (the provider's try/catch turns it into the honest "not installed" error).
const emptyModule = path.resolve(projectRoot, 'metro-empty.js');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'playwright' || moduleName === 'playwright-core') {
    return { type: 'sourceFile', filePath: emptyModule };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
