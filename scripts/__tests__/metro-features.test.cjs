const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { configureFeedBuild } = require('../metro-features.cjs');

test('disabled Feed excludes its Expo route on Windows and Unix without blocking Home', () => {
  const root = path.resolve('project');
  const existing = /existing-exclusion/;
  const config = configureFeedBuild({ resolver: { blockList: existing } }, root, false);
  assert.equal(config.resolver.blockList[0], existing);
  const route = path.join(root, 'app', '(tabs)', 'feed', 'index.tsx');
  for (const file of [route, route.replace(/\\/g, '/'), route.replace(/\//g, '\\')]) {
    assert(config.resolver.blockList.some((rule) => rule.test(file)), file);
  }
  assert(!config.resolver.blockList.some((rule) => rule.test(path.join(root, 'app', '(tabs)', 'home', 'index.tsx'))));
});

test('disabled Feed resolves barrel exports to an empty module, not the feature tree', () => {
  const root = path.resolve('project');
  const config = configureFeedBuild({ resolver: {} }, root, false);
  const context = { resolveRequest: (_context, name) => ({ type: 'sourceFile', filePath: path.resolve(root, name) }) };
  for (const platform of ['ios', 'android', 'web']) {
    for (const file of ['screens/FeedScreen.tsx', 'components/Home/Feed.tsx']) {
      assert.deepEqual(config.resolver.resolveRequest(context, file, platform), {
        type: 'sourceFile', filePath: path.resolve(root, 'config/disabledFeed.tsx'),
      });
    }
    assert.deepEqual(config.resolver.resolveRequest(context, 'screens/HomeScreen.tsx', platform), {
      type: 'sourceFile', filePath: path.resolve(root, 'screens/HomeScreen.tsx'),
    });
  }
});

test('keeps an existing custom resolver and allows an explicit Feed-enabled build', () => {
  const result = { type: 'empty' };
  const original = { resolver: { resolveRequest: () => result } };
  assert.equal(configureFeedBuild(original, process.cwd(), true), original);
  assert.equal(original.resolver.blockList, undefined);
  const disabled = configureFeedBuild({ resolver: { resolveRequest: () => result } }, process.cwd(), false);
  assert.equal(disabled.resolver.resolveRequest({}, 'unrelated', 'ios'), result);
});
