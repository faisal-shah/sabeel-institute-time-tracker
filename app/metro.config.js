// Metro configured for the npm-workspaces monorepo: watch the repo root and resolve
// modules from both the app and the hoisted root node_modules.
// Sentry's wrapper adds debug IDs to bundles so uploaded source maps match
// exactly; it delegates to expo's default config otherwise.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
