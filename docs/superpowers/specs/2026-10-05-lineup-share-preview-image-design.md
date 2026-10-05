# Line-up Share Preview Image — Design

**Date:** 2026-10-05
**Status:** Approved

## Summary

When a member shares the line-ups for an upcoming game, the shared link
unfurls into a preview image of both teams in WhatsApp, iMessage, Slack and
Discord. The share message text is unchanged; only the link at the end
changes, to a week-specific signed URL whose page carries `og:image`
metadata pointing at a server-rendered line-ups image.

The image is generated with `ImageResponse` from `next/og` (built into
Next 16). No new dependencies.

## Decisions

| Question | Decision |
|---|---|
| Mechanism | Open Graph link preview (not a file attached via the share sheet) |
| Target apps | A mix: WhatsApp, iMessage, Slack, Discord |
| Privacy | Signed share link: the image only shows names when the link's signature is valid |
| Image layout | "Names first" (layout C): two shaded team halves, large names, wordmark at the bottom |
| Message text | Kept exactly as today, team lists included; the image is additive |

## 1. Share flow

### Signed share link

- New endpoint `POST /api/league/[id]/lineup-share`, body `{ weekId }`,
  returns `{ url }`.
- The endpoint signs only when the requester can currently see that line-up:
  the same rule that decides whether the Results tab shows the next-match
  line-up card for them (league not hidden for their tier, and the week
  belongs to this league with status `scheduled`, including weeks past the
  deadline that are awaiting a result, since the card still offers Share). Sharing can never expose more than the
  sharer can already see.
- The endpoint also returns `{ url: null }` when the `lineup_share_image`
  feature is off for the requester's tier (see §4).
- Response URL: `https://craft-football.com/{slug}?lineup=<token>`.

### Token format

```
<weekId as base64url, 22 chars>.<signature, 16 chars base64url>
```

- `signature` = first 12 bytes of
  `HMAC-SHA256(SHARE_SIGNING_SECRET, "lineup:v1|" + weekId + "|" + teamA.join("\n") + "|" + teamB.join("\n"))`,
  base64url-encoded.
- Team arrays are signed in stored order. Any edit to the line-ups (adding,
  removing, swapping or reordering players) produces a new signature, which
  means:
  - **Re-sharing after an edit yields a new URL**, so Slack and Discord fetch
    a fresh preview instead of serving a cached one.
  - **An old link opened after an edit fails verification** and renders the
    generic card, never stale teams. Previews already sent in WhatsApp and
    iMessage are unaffected, because those apps store the image in the
    message at send time.
- Token helpers (`signLineupToken`, `verifyLineupToken`) live in a new
  server-only module `lib/lineupShare.ts`. Verification uses
  `crypto.timingSafeEqual`.
- `SHARE_SIGNING_SECRET` is a new server-side environment variable. It must
  be added in Vercel (production and preview) and `.env.local` before
  deploying. If it is missing, the endpoint returns `{ url: null }` and the
  image route always renders the generic card.

### Client behaviour (`NextMatchCard`)

- When the card enters the `lineup` state with a saved `scheduledWeek` (both
  teams non-empty), it calls the share endpoint in the background and stores
  the returned URL in state. It calls again whenever the scheduled week's
  id or team lists change (e.g. after Edit Lineups → save).
- **Why it fetches ahead of the tap:** iOS Safari rejects `navigator.share`
  if the user-activation window lapses while awaiting a network request, so
  the URL must be ready when Share is tapped.
- `handleShare` passes the signed URL to `buildShareText`. If the URL has not
  arrived (still loading, request failed, feature off, secret missing),
  `buildShareText` falls back to today's `https://craft-football.com/{slug}`.
- `buildShareText` gains an optional `shareUrl?: string` parameter that
  replaces the final link line. All other lines are unchanged.
- Share mechanics (`navigator.share({ text })`, clipboard fallback) are
  unchanged at launch. See §5 for the device test that decides whether to
  also pass `url` separately.

## 2. Page metadata

- `app/[slug]/page.tsx` already redirects `/{slug}` to `/{slug}/overview` or
  `/{slug}/results` via `leagueLandingPath`. The redirect must **preserve the
  query string**, so `?lineup=` survives. Crawlers follow the redirect.
- `leaguePageMetadata(slug, page)` in `lib/metadata.ts` gains an optional
  `lineupToken` argument. The Overview and Results pages pass
  `searchParams.lineup` through from their `generateMetadata`.
- When a token is present, the metadata verifies it against the week's
  current teams and adds:
  - `openGraph.title`: `Week {n} line-ups · {league name}`
  - `openGraph.description`: date, kick-off time and venue where set, joined
    with ` · ` (e.g. `Tue 7 Oct · 19:00 · Powerleague Shoreditch`)
  - `openGraph.images`: `[{ url: /api/og/lineup?t=<token>, width: 1200, height: 630 }]`
  - `twitter.card`: `summary_large_image` (Slack and Discord use it to choose the large layout)
- With no token or a token that fails verification, metadata is exactly as
  today. The tab title logic is untouched.
- The page body ignores `?lineup=`; visitors see the normal tab.

## 3. Image route

**Path:** `app/api/og/lineup/route.tsx`, Node runtime, `GET ?t=<token>`.

### Behaviour

1. Decode the token. Malformed → generic card.
2. Load the week (team lists, week number, date, format) plus the league's
   name, location and kick-off time using the service-role client.
   Missing → generic card.
3. Verify the signature against the current team lists. Mismatch → generic card.
4. Render the line-ups image.

Every path returns a 200 PNG. The route never returns an error status, so
previews never break outright.

**Headers:** `Content-Type: image/png`,
`Cache-Control: public, max-age=3600, s-maxage=86400`. This is safe to cache
because the token changes whenever the content would.

### Line-ups image (1200 × 630)

- **Background:** `#060b14`. The left half has a vertical gradient
  `rgba(8,47,73,.7)` → `rgba(8,47,73,.25)` and the right half
  `rgba(46,16,101,.6)` → `rgba(46,16,101,.2)`. There is an 8px `#38bdf8` bar
  on the far left edge, an 8px `#a78bfa` bar on the far right edge, and a 2px
  centre divider in `#2c4a72` that fades out at the top and bottom.
- **Top line** (IBM Plex Mono 700, ~19px, uppercase, letter-spacing .15em,
  `#8ba4c4`): `{League name} · Week {n}` on the left, and
  `{Ddd D Mmm} · {kick-off}` on the right (kick-off omitted if not set).
- **Team columns:** two equal columns, padding 60px left and right, 120px gap.
  - Heading: Space Grotesk 700, ~24px, letter-spacing .06em; "TEAM A" in
    `#7dd3fc`, "TEAM B" in `#c4b5fd`.
  - Names: Inter 700, line-height 1.28; Team A `#dff1ff`, Team B `#efeaff`,
    one per line.
- **Bottom:** centred Craft Football wordmark (ball mark ~28px plus
  "Craft Football" in Space Grotesk 700 ~21px, `#f4f9ff`) at 90% opacity,
  24px from the bottom.
- **Logo:** the ball mark is drawn from the vector paths in `app/icon.svg`
  in `#d8d8d8`. Do not use `public/logo.png`, which is 80 × 80 and blurs at
  this size.
- **No ratings, prediction or goalkeeper glove** in the image. The
  prediction stays in the message text.

### Name sizing

`lineupImageFontSize(rowCount, longestNameLength)` is a pure function in
`lib/utils.ts`:

- Target 40px. That fits 7 rows with names up to ~16 characters.
- Shrinks with `rowCount` so the column always fits the space between the
  team heading and the wordmark (8-a-side and above).
- Shrinks further for long names so the longest fits half the width.
- Floor: 24px. Below that, names are truncated with an ellipsis.

### Generic card (1200 × 630)

Same background without team shading: a centred, larger Craft Football
wordmark with the line "Results, stats and fair teams for your weekly game."
in `#8ba4c4`. It contains no league name or player data, so a bad or stale
token reveals nothing.

### Fonts

`ImageResponse` needs TTF or OTF data (not WOFF2), so the following files
are added under `assets/fonts/` (all OFL-licensed) and read once per
instance with `fs.readFile`:

- `SpaceGrotesk-Bold.ttf`
- `Inter-Bold.ttf`
- `IBMPlexMono-Bold.ttf`

## 4. Feature flag

New feature key `lineup_share_image`, following `docs/FEATURE_FLAGS.md`:

- Add `'lineup_share_image'` to `FeatureKey` in `lib/types.ts`.
- Add a `DEFAULT_FEATURES` entry in `lib/defaults.ts` with
  `enabled: false, public_enabled: false`.
- Wire a row into `FeaturePanel.tsx`.
- Add a migration that inserts `('lineup_share_image', true)` into
  `feature_experiments` and seeds `league_features` rows for every game
  (both toggles off), mirroring the `quarter_celebration` seed.

**Gating:** the share endpoint checks
`isFeatureEnabled(features, 'lineup_share_image', resolveVisibilityTier(role))`
for the requester (admins bypass). When off, it returns `{ url: null }` and
Share behaves exactly as today.

Links that have already been shared keep working if the flag is later turned
off. The flag controls who can create new signed links, not whether
existing ones render.

**Rollout note:** production migrations can lag behind `main`. Confirm the
`feature_experiments` row exists in production before testing, and apply
the seed by hand if needed.

## 5. Testing

### Unit (Jest)

- `signLineupToken` / `verifyLineupToken`:
  - round-trip passes
  - a tampered signature fails
  - a tampered week ID fails
  - changing, adding, removing or reordering a player fails
  - malformed tokens fail without throwing
  - a missing secret fails closed
- `lineupImageFontSize`: 5, 6, 7 and 9 rows; long names; the floor.
- `buildShareText`: uses `shareUrl` when given and falls back to the league
  URL when not; all other lines unchanged.
- `/{slug}` root redirect (`app/[slug]/page.tsx`): the query string is preserved.
- `leaguePageMetadata`: with a valid token it adds `og:image`, the title,
  the description and the twitter card; with no token or an invalid one the
  output is identical to today.
- Share endpoint: signs for a viewer who can see the line-up; returns
  `{ url: null }` when the feature is off, the league is hidden for the
  tier, or the week is not a `scheduled` week of this league.

### Manual device matrix (before promoting beyond admins)

Share a real line-up from a phone and from desktop (clipboard paste) into:

- WhatsApp: iOS, Android, and WhatsApp Web
- iMessage
- Slack
- Discord

For each, record whether the large preview appears, whether the text
arrives intact, and whether the link appears once.

**Decision rule for `navigator.share({ text, url })`:** if passing `url` in
addition to `text` (with the link removed from `text`) gives iMessage a rich
link **and** WhatsApp still receives exactly one link with the full text,
switch to it. Otherwise keep the text-only share.

Also check that editing the line-ups and re-sharing produces a new link
with a fresh image in Slack.

## Out of scope

- The Overview tab's next-game card (it has no Share button today).
- Preview images for result, DNF and quarter shares.
- A site-wide default `og:image`.
- Attaching the image as a file via the Web Share API.
- Ratings, prediction or goalkeeper markers in the image.
