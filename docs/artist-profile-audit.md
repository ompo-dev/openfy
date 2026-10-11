# Artist profile audit (2026-10-11)

## Confirmed causes

- Search injected stored Spotify identities into a public YouTube Music result
  list. Song credits retained the Spotify route even without Spotify access.
- Artist routes include a display name after `~`. Dedupe, profile caches, search
  previews, and artwork treated that entire route as an identity. YouTube Music
  credits named RND and Sotam pointed to the same channel but produced two entries
  and separate catalog requests.
- The default English session returned RADIOACTIVE when the saved recording was
  RADIOATIVO, preventing a recording-based identity confirmation.
- Following and library grouping used names, merging unrelated homonyms.
- A delayed credit lookup from a previous track could replace current warmups.

## Identity rules

- Compare case-sensitive provider IDs, not route labels or display names.
- Use the current artist shelf/header name for a known YouTube channel. Retain
  separate channels with the same name.
- Bridge a Spotify credit only with matching recording and collaborator evidence.
  Verify a channel header before interpreting an old alias or combined credit.
  Failed resolutions retain the original credit and retry after a short cache TTL.
- Public search does not inject unconfirmed Spotify-only profiles.
- Share progressive profile results, previews, biography, and artwork by channel.
- Include only credited recordings in an artist's playback catalog. Related videos,
  uncredited uploads, and same-name recordings from different channels are excluded.
- Portuguese search/top-song shelves are adapted explicitly because the vendor's
  convenience getters only recognize English labels. Keep one bound Music instance:
  Innertube's `music` property creates a new instance on each access.
- Artwork storage v6 invalidates old route-based/case-folded cache keys; artwork is
  fetched again on first use, without deleting saved music or follows.

## Verification

- Complete Jest run: 105 suites passed, 737 tests passed; 24 existing tests skipped.
  Coverage includes search/navigation/history, artist profiles, library/follows,
  player/queues/recovery, downloads, lyrics, modals, imports, and OTA updates.
- TypeScript: passed. ESLint: zero errors, 41 existing warnings.
- Live queries through the actual localization adapter confirmed RADIOATIVO and
  the 7 Minutoz artist share `UC7tLuFSDy-yNoNFUOxef8QA`.
- Sotam resolves to `UCHguBpZUpBR52kmx9DMCTFA`; the observed RND credit used that
  same channel. Its localized full-song shelf and playlist returned 101 rows in
  the first page with continuation. An album request returned seven tracks.
- Sid's Isso Vale Minha Vida credit resolved to `UCNhFr4PMhJTIU5CvkzQUNuQ`
  with the combined Sid & Tavin credit. No artist IDs are hardcoded in the fix.

This is automated and live-catalog verification, not a claim that every screen
was manually exercised. Physical iPhone rendering, gestures, background audio,
and native builds require device/macOS verification and were not run on Windows.
