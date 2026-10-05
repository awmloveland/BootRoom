# Fonts for generated images

Static bold TTFs used by `next/og` (Satori) in `app/api/og/lineup/route.tsx`.
Satori cannot read the WOFF2 files `next/font` serves to the site, so these
copies live here and are read at runtime by `lib/ogFonts.ts`.

| File | Family | Source |
|---|---|---|
| `SpaceGrotesk-Bold.ttf` | Space Grotesk 700 | Google Fonts |
| `Inter-Bold.ttf` | Inter 700 | Google Fonts |
| `IBMPlexMono-Bold.ttf` | IBM Plex Mono 700 | Google Fonts |

All three are licensed under the SIL Open Font License 1.1
(https://openfontlicense.org).
