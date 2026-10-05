# OTA updates

Openfy publishes JavaScript and static asset updates directly from GitHub Actions,
without an Expo account or `EXPO_TOKEN`.

## CI window

After validation, `Openfy CI/CD` exports the iOS and Android bundles, serves the
Expo Updates protocol from its GitHub runner, and exposes that runner through a
temporary Cloudflare Quick Tunnel. GitHub publishes the tunnel URL, runtime, and
expiry in the `ota-window` release asset `openfy-ota-pointer.json`. The server
stays available for 10 minutes after that pointer is published; CI then marks the
pointer inactive and stops both processes. The pointer is polled by the app while
it is open, and is also checked when the app launches or returns to the foreground.

Startup verifies the local server and then the public tunnel against the same
runtime and update ID. The CI tunnel uses HTTP/2 over IPv4 and retries startup up
to three times, with bounded network requests. A hostname alone is not enough to
publish the pointer. Failures print the server/tunnel diagnostics and upload them
as the `Openfy-OTA-logs` artifact; both processes are cleaned up even if startup fails.

The stable pointer is hosted as a GitHub Release asset. The app only accepts HTTPS
manifest URLs under `*.trycloudflare.com`, the expected Expo Updates path, the
installed runtime version, and an unexpired window. The server only returns iOS or
Android files that were part of that run's Expo export.

## Installing an update

The native URL override is experimental in `expo-updates`. The first installation
after this change must use the new IPA once; earlier installed builds cannot gain
the native override support through JavaScript alone. When CI publishes an active
window, the app prepares its temporary URL and asks to be fully closed and opened
again. On that next launch, `expo-updates` checks the temporary server and loads
the matching bundle. Later JavaScript-only pushes do not require another IPA.

Updates only apply to a matching runtime version. Native modules, permissions,
entitlements, or other native changes still require a new IPA/APK. The workflow
continues generating those artifacts as before.

## Important limitations

Expo requires `disableAntiBrickingMeasures` for runtime URL overrides and warns
against using this experimental API in production. With it enabled, Expo cannot
automatically roll back a bad downloaded update to the embedded bundle; recovery
may require reinstalling an IPA. Keep a known-good IPA available.

Cloudflare Quick Tunnels need no account or domain, but Cloudflare describes them
as for testing and development, with no uptime guarantee. Their random public URL
expires when the CI process stops, and anyone who learns the URL can access the
temporary server. This workflow is intended for this personal sideload/update
flow, not for general distribution.

References: [Expo runtime override and recovery warning](https://docs.expo.dev/eas-update/override/),
[Expo Updates protocol](https://docs.expo.dev/technical-specs/expo-updates-1/),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
