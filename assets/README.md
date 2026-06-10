# My Ledger — App Icon (Two Coins, pure white)

Xcode-ready export of the approved "Two Coins" icon.
Colours: Alex = teal `#0F766E`, Mina = warm `#C2410C`. Background pure white. ¥ set in JetBrains Mono ExtraBold.

## Recommended: drop-in asset catalog (modern, Xcode 14+)
`AppIcon.appiconset/` is a complete single-size icon set.

1. In Xcode, open `Assets.xcassets`.
2. Delete the existing `AppIcon` if present.
3. Drag the whole `AppIcon.appiconset` folder into the asset catalog.
   (Or replace the contents of your existing `AppIcon.appiconset` with these two files.)

Xcode auto-generates every device size from the single 1024×1024 master — no per-size slicing needed.

## Files
- `AppIcon.appiconset/AppIcon-1024.png` — 1024×1024 master (App Store + all device sizes)
- `AppIcon.appiconset/Contents.json` — asset-catalog manifest (single-size)
- `icon.svg` — editable vector source (1024 viewBox)
- `png/` — standalone rasters at common point sizes (1024, 180, 167, 152, 120, 76, 60, 40) for any non-catalog use

## Notes
- The PNG is fully opaque with square corners — iOS applies the rounded "squircle" mask automatically. Do not pre-round.
- No alpha channel is required for the App Store icon; this export already avoids transparency.
