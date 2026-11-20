# Gym Notes UI

Copied with PowerShell `Copy-Item` from the user's local Gym repository, commit
`2490a4053447361e1ad55640ec206662d7124cbc`. The MIT license is included in `LICENSE`.

The imported implementation owns the modal layout, nested sheets, settings rows,
sections, switches, segmented controls, glass buttons, press animations and icons.
Openfy bridges in `components/gym` supply its logger, Portuguese labels, existing
fonts, dark theme and music-specific settings modal identifiers through TypeScript
aliases. The global web body reset is not imported. Tracking is normalized to zero.

Integration changes to `SheetFrame` enable swipe dismissal, keyboard avoidance for
short sheets, bounded self-scrolling lists and test identifiers. Small-sheet drag
dismissal uses Openfy's existing gesture coordinator without changing Gym's layout.
The full music player's shared cover flight keeps its single animation coordinator;
its controls and modal material use this same copied UI.

`SettingsRow` additionally accepts music-specific leading icons and disabled
actions. `SettingsRow`, `NativeSegmented` and `GlassSurfaceFallback` obtain the
color scheme from Openfy's dark app theme instead of the device theme.

Modal headers balance the leading/trailing action widths and put the close action
opposite a single confirmation/refresh action. Row and field titles use compact
16-point type, with one-line row titles and accessibility states for selectors.
Streaming/download quality use the same native menu/fallback option menu as Gym's
settings. Lyrics provider priority uses `react-native-reorderable-list` within the
copied sheet, including long-press handles, optimistic ordering, persistence
rollback and screen-reader reorder actions.

`TextField` was extracted from the copied `settings/ApiKeysSheet.tsx` field,
keeping its layout/styles while accepting non-secret playlist fields and logging
input boundaries. `HeaderIconButton` is exported for playlist save/close actions
with accessible disabled/busy states; its original glass and filled variants remain.

Settings open from `SettingsModalHost` over the existing page rather than navigating
to a blank screen before presenting. A direct settings link keeps its route-owned
instance. Nested settings and playlist editors use the copied sheet/stack rules.
Native and fallback switches/segmented controls retain real disabled states.
