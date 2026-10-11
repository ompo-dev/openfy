# OTA updates

Openfy publishes JavaScript and static asset updates directly from GitHub Actions,
without an Expo account or `EXPO_TOKEN`.

## CI window

After validation, `Openfy CI/CD` exports the iOS and Android bundles, serves the
Expo Updates protocol from its GitHub runner, and exposes that runner through a
temporary Cloudflare Quick Tunnel. GitHub publishes the tunnel URL, runtime, and
expiry in the `ota-window` release asset `openfy-ota-pointer.json`. The server
stays available for 10 minutes after that pointer is published; CI then marks the
pointer inactive and stops both processes. The pointer is polled once per minute
while the app is open. Launching or returning to the foreground does not query
the pointer or trigger an Expo update check. This existing transport is polling,
not a push notification service.

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
again. The app persists the validated CI notice locally, including its run,
runtime, update ID, endpoint, and expiry. On that next launch, the installed
bundle reads only this local notice. With no pending notice it opens normally
without a network update check. With a pending notice it checks the already
prepared temporary server, without re-fetching the pointer. The notice is cleared
once its expected update ID is the running bundle, so later launches do not check
again until another CI notice is discovered. A failed or deferred download keeps
the notice for retry, while the CI window remains available.
The update screen shows checking, downloading
(with native download progress when available), and applying before reloading
the matching bundle. Users can retry a failure or continue using the installed
version; dismissing the screen never triggers a late automatic restart. A
download already in progress can finish in the background for the next launch.
Expired windows and disabled automatic updates do not block app access.

The native `checkAutomatically: NEVER` policy requires a new IPA/APK once. Older
`ON_LOAD` builds can observe native startup downloads after JavaScript starts,
but cannot show React UI while native code is still holding the launch screen.
Later JavaScript-only pushes do not require another IPA.

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
