# OTA updates

Openfy uses `expo-updates` with EAS Update for JavaScript, UI, and asset updates.
The phone keeps all music/download logic local; this is only an app bundle delivery
channel and is not an Openfy API.

## How it ships

- Native builds read updates from `https://u.expo.dev/33b0281a-b127-47fe-ab16-e94caf272493`.
- The configured channel is `production`.
- The runtime policy is `appVersion`, so OTA updates apply to installed builds with
  the same `expo.version`.
- The app checks on launch and also fetches opportunistically when returning to the
  foreground after one hour. It never calls `reloadAsync`, so music playback is not
  interrupted; a fetched update is used on the next cold launch.

## GitHub automation

The `Openfy CI/CD` workflow validates the app on every push to `main`, publishes
OTA when `EXPO_TOKEN` is configured, and generates IPA/APK artifacts on push.
Manual dispatch also generates IPA/APK by default. OTA publishes with:
Unit tests run in the same workflow but do not block IPA/APK artifact generation.

```sh
eas update --channel production --environment production --auto --non-interactive
```

GitHub needs a repository secret named `EXPO_TOKEN` from the Expo account that owns
the EAS project. If the secret is missing, the workflow exits successfully with a
warning and does not publish an OTA update.

## When a new IPA/APK is still required

OTA cannot change native code, native modules, entitlements, permissions, bundle
identifiers, Info.plist, AndroidManifest, or dependency changes that include native
code. For those changes, build and install a new IPA/APK, then OTA can cover later
JavaScript and asset fixes for that app version.

The native playback fixes use `expo.version` 1.0.1. Devices on runtime 1.0.0
must install that IPA/APK first; an OTA bundle cannot install the Swift patch.
