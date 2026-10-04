# Audio Preferences

Settings persist in `openfy_app_settings_v1`. Existing installations retain their
boolean preferences; unknown enum values fall back to stereo and high quality.

## Output Channels

- Stereo preserves the decoded channels. Mono averages the channels and plays
  that mix through both sides, including downloaded audio.
- Android uses Media3's `AudioMixingUtil` in a persistent PCM audio processor.
  Changing modes does not replace the source, flush the player, or seek.
- iOS uses an `MTAudioProcessingTap` on decoded Float32 PCM, both for Expo Audio
  and the native YouTube player. Stereo disables the mix; samples never pass
  through JavaScript. Unsupported tap formats are left untouched.
- Web uses a media-element source and a mono-channel Web Audio gain node.
  Sampling shares that output graph. Cross-origin sources must permit CORS;
  unsupported current sources are rejected before creating a graph, keeping
  stereo playback and the saved preference intact. Audio also needs a browser
  user gesture. Sources loaded after selecting mono request CORS explicitly.

The output is applied before playback. A settings change is published only after
the engine accepts it and storage succeeds. Storage failure restores the previous
output mode. Diagnostics distinguish the applied mode from saved preferences.

## Quality

High selects the highest available audio bitrate; economy selects the lowest.
There is no invented fixed bitrate or lossless upgrade. YouTube native playback
and downloads select AAC/MP4 variants; the JavaScript resolver uses youtubei.js
`best`/`bestefficiency`. A provider offering only one variant cannot change quality.

Streaming and downloads have independent preferences. Resolver caches, in-flight
requests and prepared queue entries include quality in their keys. Switching
streaming quality discards prepared sources and rebuilds the neighboring window
without interrupting the current song. The next resolution uses the new setting.
Existing downloaded files are not rewritten.
Web entries storing only remote URLs retain their selection quality, so they
cannot bypass a different streaming preference. Actual local/blob audio is kept.

## Builds And Verification

Native changes require a **new installed iOS/Android binary**, not only an OTA
update. Capability flags hide unavailable controls in older binaries. Keep
`patches/expo-audio+57.0.4.patch` applied via the existing postinstall script.

Unit tests cover preferences, migration, rollback, quality isolation, queue
invalidation and native bridge compatibility. Web QA uses a stereo WAV and checks
mono PCM plus live mode switching. Before release, compile both native targets
and test stereo/mono on a device with local audio, YouTube streams, headphones,
background playback, interruptions, seek, queue changes and media-service resets.
Those native device checks cannot be substituted by JavaScript tests.

Primary implementation references:

- [Media3 AudioMixingUtil](https://github.com/androidx/media/blob/1.9.0/libraries/common/src/main/java/androidx/media3/common/audio/AudioMixingUtil.java)
- [Apple audio processing tap](https://developer.apple.com/library/archive/qa/qa1783/_index.html)
- [Web Audio media-element source](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource)
