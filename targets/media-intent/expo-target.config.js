/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'intent',
  name: 'media-intent',
  displayName: 'Openfy Music Suggestions',
  bundleIdentifier: '.mediaintent',
  deploymentTarget: '16.4',
  frameworks: ['Intents'],
});
