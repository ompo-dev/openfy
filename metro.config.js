// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { configureFeedBuild } = require('./scripts/metro-features.cjs');

const config = getDefaultConfig(__dirname);

module.exports = configureFeedBuild(config, __dirname, process.env.EXPO_PUBLIC_ENABLE_FEED === 'true');
