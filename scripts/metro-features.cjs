const path = require('node:path');

/** Exclude the route from Expo's context and its implementation from the dependency graph. */
function configureFeedBuild(config, projectRoot, enabled) {
  if (enabled) return config;
  const routeRoot = path.join(projectRoot, 'app', '(tabs)', 'feed');
  const escapedRoute = routeRoot.split(/[\\/]/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]');
  const previousBlocks = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(previousBlocks) ? previousBlocks : previousBlocks ? [previousBlocks] : []),
    new RegExp(`^${escapedRoute}[\\\\/].*$`),
  ];
  const entries = new Set(['screens/FeedScreen.tsx', 'components/Home/Feed.tsx']
    .map((entry) => path.resolve(projectRoot, entry)));
  const fallback = path.resolve(projectRoot, 'config/disabledFeed.tsx');
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const result = resolve ? resolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
    return result.type === 'sourceFile' && entries.has(path.resolve(result.filePath))
      ? { type: 'sourceFile', filePath: fallback } : result;
  };
  return config;
}

module.exports = { configureFeedBuild };
