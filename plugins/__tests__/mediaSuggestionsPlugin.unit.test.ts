import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IOSConfig } from 'expo/config-plugins';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withMediaSuggestions = require('../withMediaSuggestions');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plist = require('@expo/plist').default;

describe('media suggestion iOS configuration', () => {
  it('sets the Xcode file type so the intent definition is actually compiled', async () => {
    const sourceFile = jest.spyOn(IOSConfig.XcodeProjectFile, 'withBuildSourceFile').mockImplementation((config) => config);
    try {
      const config = withMediaSuggestions({ name: 'Openfy', slug: 'openfy' });
      const reference = { path: '"Openfy/OpenfyMedia.intentdefinition"', lastKnownFileType: 'unknown' };
      await config.mods.ios.xcodeproj({ modResults: { pbxFileReferenceSection: () => ({ file: reference, file_comment: 'OpenfyMedia.intentdefinition' }) } });
      expect(reference.lastKnownFileType).toBe('file.intentdefinition');
    } finally { sourceFile.mockRestore(); }
  });

  it('registers background intent handling without changing the app scene lifecycle', async () => {
    const config = withMediaSuggestions({ name: 'Openfy', slug: 'openfy' });
    const input = { modResults: { language: 'swift', contents: 'import Expo\nclass AppDelegate: ExpoAppDelegate {\n}' } };
    const first = await config.mods.ios.appDelegate(input);
    const second = await config.mods.ios.appDelegate(first);
    expect(second.modResults.contents.match(/public func application/g)).toHaveLength(1);
    expect(second.modResults.contents).toContain('internal import OpenfyYouTube');
    expect(second.modResults.contents).toContain('handle intent: INIntent');
    expect(second.modResults.contents).toContain('OpenfyMediaIntentHandler().handle');
    expect(second.modResults.contents).not.toContain('handlerFor');
    expect(second.modResults.contents).not.toContain('UIScene');
  });

  it('opts into media suggestions using only the media container combination', () => {
    const definition = plist.parse(readFileSync(resolve(__dirname, '../OpenfyMedia.intentdefinition'), 'utf8'));
    const intent = definition.INIntents[0];
    expect(intent.INIntentClassName).toBe('INPlayMediaIntent');
    expect(Object.keys(intent.INIntentParameterCombinations)).toEqual(['mediaContainer']);
    expect(intent.INIntentParameterCombinations.mediaContainer.INIntentParameterCombinationSupportsBackgroundExecution).toBe(true);
    const extension = plist.parse(readFileSync(resolve(__dirname, '../../targets/media-intent/Info.plist'), 'utf8'));
    expect(extension.NSExtension.NSExtensionAttributes.IntentsSupported).toEqual(['INPlayMediaIntent']);
    expect(extension.NSExtension.NSExtensionAttributes.IntentsRestrictedWhileLocked).toEqual([]);
  });
});
