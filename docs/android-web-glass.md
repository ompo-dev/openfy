# Android and Web Glass

Openfy's portable material is visually informed by BeatWave's `GlassEffect`,
`GlassCircleButton`, floating navigation, player, and artist/album chrome. This
is an independent React Native implementation, not a port of its GPL code.
Apple's native iOS Liquid Glass and legacy UIBlurEffect remain unchanged.

## Material

- `GlassSurface` is the shared entry point for buttons, action groups, pills,
  menus and navigation. The mini player uses the same portable fallback.
- Clear/regular controls use light diffusion, a translucent dark tint, a static
  diagonal highlight, a thin asymmetric rim, and a small shadow. Thick surfaces
  provide stronger diffusion. Large sheets disable control rims and shadows.
- Web uses compositor backdrop blur and saturation. Android 12+ uses Expo's
  RenderNode blur; earlier Android versions use the same translucent tint and
  highlights without the costly software blur path.
- The edge treatment approximates glass depth, not BeatWave's RuntimeShader
  lens/chromatic refraction. No continuous highlight animation, screenshot
  polling, new rendering engine, or blur attached to every song row is added.
- Decorative layers ignore touch/accessibility events. The border is an overlay,
  so content dimensions and marquee measurements do not change.

## Capture Boundaries

`GlassScreenBackdrop` registers the focused tab's page with the root provider.
Only the floating mini player and navigation sample that page. Descendants of a
capture receive no reference to that same capture: native blur targets must not
contain a blur view sampling themselves.

Player, artist/album heroes, feature artwork and snippet/sheet backgrounds use
`GlassBackdropScope` with a background-only `GlassBackdrop` sibling. Their
controls sample it without recording themselves or the scrolling controls.
Native modal windows reset inherited targets; each sheet owns its background.
Targets are released on navigation exit, and inactive tabs do not replace the
focused page's target. Captures update natively, not through React position ticks.

## Verification

Tests cover platform capability gates, native target isolation/sharing/release,
cross-window boundaries, variant strengths, translucent tints, touch passthrough,
content geometry, and preservation of the legacy iOS path. Browser checks should
also inspect real artwork behind circular controls, wide pills and fitted sheets
at narrow phone and desktop sizes. Physical Android GPU behavior still requires
a device/emulator run.

References: [Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/)
and [Dimezis BlurView](https://github.com/Dimezis/BlurView).
