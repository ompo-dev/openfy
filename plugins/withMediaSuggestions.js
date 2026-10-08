const { readFileSync } = require('node:fs');
const { withAppDelegate, withXcodeProject, IOSConfig } = require('expo/config-plugins');

module.exports = (config) => {
  // Register first so this runs after withBuildSourceFile in Expo's mod chain.
  config = withXcodeProject(config, (config) => {
    const references = Object.values(config.modResults.pbxFileReferenceSection()).filter((reference) =>
      typeof reference === 'object' && reference.path?.replace(/^"|"$/g, '').endsWith('OpenfyMedia.intentdefinition')
    );
    if (!references.length) throw new Error('Openfy media intent definition is missing from the Xcode project');
    // node-xcode does not recognize .intentdefinition; Xcode must compile it, not ignore it.
    references.forEach((reference) => { reference.lastKnownFileType = 'file.intentdefinition'; });
    return config;
  });
  config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: 'OpenfyMedia.intentdefinition',
    contents: readFileSync(require.resolve('./OpenfyMedia.intentdefinition'), 'utf8'),
    overwrite: true,
  });
  return withAppDelegate(config, (config) => {
    const delegate = config.modResults;
    if (delegate.language !== 'swift') throw new Error('Openfy media suggestions require a Swift AppDelegate');
    if (!delegate.contents.includes('OpenfyMediaIntentHandler().handle')) {
      const marker = /(class AppDelegate\s*:\s*ExpoAppDelegate[^\{]*\{)/;
      if (!marker.test(delegate.contents)) throw new Error('Cannot register the Openfy media intent handler');
      // Expo's Swift 6 module provider imports this generated module with an
      // explicit internal access level. Match it in AppDelegate or Swift emits
      // an ambiguous implicit-access-level error during Release builds.
      delegate.contents = `import Intents\ninternal import OpenfyYouTube\n${delegate.contents}`.replace(marker, `$1
  public func application(_ application: UIApplication, handle intent: INIntent,
    completionHandler: @escaping (INIntentResponse) -> Void) {
    guard let mediaIntent = intent as? INPlayMediaIntent else {
      completionHandler(INPlayMediaIntentResponse(code: .failure, userActivity: nil))
      return
    }
    OpenfyMediaIntentHandler().handle(intent: mediaIntent) { response in completionHandler(response) }
  }
`);
    }
    return config;
  });
};
